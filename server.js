import express from 'express';
import cors from 'cors';
import axios from 'axios';
import { WebSocketServer, WebSocket } from 'ws';
import zlib from 'zlib';

const app = express();
app.use(cors());

// B站直播弹幕WebSocket连接配置
const LIVE_WS_URL = 'wss://hw-bj-live-comet-05.chat.bilibili.com/sub';

// WebSocket客户端连接管理
const wsClients = new Map();

// 生成认证包
function generateAuthPacket(roomId) {
    const authData = {
        uid: 0,
        roomid: parseInt(roomId),
        protover: 3,
        platform: 'web',
        type: 2,
        key: '',
        clientver: '2.6.42'
    };
    const data = JSON.stringify(authData);
    console.log('生成认证包数据：', data);
    return generatePacket(7, data);
}

// 生成心跳包
function generateHeartbeatPacket() {
    return generatePacket(2, '[object Object]');
}

// 生成数据包
function generatePacket(op, body) {
    const bodyBuffer = Buffer.from(body);
    const packetLen = bodyBuffer.length + 16;
    const headerBuffer = Buffer.alloc(16);
    
    // 写入包头
    headerBuffer.writeUInt32BE(packetLen, 0);     // 包长度
    headerBuffer.writeUInt16BE(16, 4);            // 头部长度
    headerBuffer.writeUInt16BE(3, 6);             // 协议版本 (3)
    headerBuffer.writeUInt32BE(op, 8);            // 操作类型
    headerBuffer.writeUInt32BE(1, 12);            // 序列号

    console.log('生成数据包：', {
        packetLen,
        headerLen: 16,
        protover: 3,
        operation: op,
        bodyLength: bodyBuffer.length,
        body: body.substring(0, 50) + (body.length > 50 ? '...' : '')
    });

    return Buffer.concat([headerBuffer, bodyBuffer]);
}

// 解析响应数据
async function parseResponse(buffer) {
    try {
        const packets = [];
        let offset = 0;

        while (offset < buffer.length) {
            // 读取包头
            const packetLen = buffer.readUInt32BE(offset);
            const headerLen = buffer.readUInt16BE(offset + 4);
            const ver = buffer.readUInt16BE(offset + 6);
            const op = buffer.readUInt32BE(offset + 8);
            const seq = buffer.readUInt32BE(offset + 12);

            console.log('解析数据包头：', {
                packetLen,
                headerLen,
                ver,
                op,
                seq,
                remainingLength: buffer.length - offset
            });

            // 验证包长度
            if (packetLen > buffer.length - offset) {
                console.error('包长度超出缓冲区范围');
                break;
            }

            // 提取消息体
            let body = buffer.slice(offset + headerLen, offset + packetLen);

            // 处理不同版本的消息
            if (ver === 3) {
                try {
                    body = await new Promise((resolve, reject) => {
                        zlib.inflate(body, (err, result) => {
                            if (err) {
                                console.error('解压数据失败：', err);
                                reject(err);
                            } else {
                                resolve(result);
                            }
                        });
                    });
                    // 解压后的数据可能包含多个包，递归解析
                    const innerPackets = await parseResponse(body);
                    packets.push(...innerPackets);
                } catch (error) {
                    console.error('处理压缩数据失败：', error);
                }
            } else if (ver === 2 || ver === 1) {
                // 处理普通消息
                switch (op) {
                    case 3: // 心跳包回应
                        packets.push({
                            op,
                            body: body.readUInt32BE(0)
                        });
                        break;
                    case 5: // 普通消息
                        try {
                            const messageStr = body.toString('utf8');
                            packets.push({
                                op,
                                body: messageStr
                            });
                        } catch (error) {
                            console.error('解析消息体失败：', error);
                        }
                        break;
                    case 8: // 认证响应
                        packets.push({
                            op,
                            body: body.toString('utf8')
                        });
                        break;
                    default:
                        console.log('未知操作类型：', op);
                        break;
                }
            }

            offset += packetLen;
        }

        return packets;
    } catch (error) {
        console.error('解析数据包失败：', error);
        return [];
    }
}

// 获取真实房间ID
async function getRealRoomId(roomId) {
    try {
        console.log(`获取房间 ${roomId} 的真实ID...`);
        const response = await axios.get(`https://api.live.bilibili.com/room/v1/Room/room_init?id=${roomId}`, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
                'Referer': 'https://live.bilibili.com'
            }
        });
        
        if (response.data.code === 0) {
            const realRoomId = response.data.data.room_id;
            console.log(`真实房间ID: ${realRoomId}`);
            return realRoomId;
        }
        throw new Error(response.data.message || '获取房间信息失败');
    } catch (error) {
        console.error('获取房间信息失败：', error);
        throw error;
    }
}

// 处理弹幕客户端
class DanmakuClient {
    constructor(roomId, ws) {
        this.roomId = roomId;
        this.ws = ws;
        this.client = null;
        this.heartbeatInterval = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 3;
        this.authenticated = false;
    }

    async connect() {
        try {
            const realRoomId = await getRealRoomId(this.roomId);
            console.log(`开始连接直播间 ${realRoomId}`);

            this.client = new WebSocket(LIVE_WS_URL, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
                    'Origin': 'https://live.bilibili.com',
                    'Sec-WebSocket-Extensions': 'permessage-deflate; client_max_window_bits',
                    'Sec-WebSocket-Version': '13'
                },
                perMessageDeflate: true,
                handshakeTimeout: 5000
            });

            this.client.on('upgrade', (response) => {
                console.log('WebSocket握手成功，响应头：', response.headers);
            });

            this.client.on('open', () => {
                console.log(`WebSocket连接已建立，准备发送认证包...`);
                this.reconnectAttempts = 0;
                this.sendAuth(realRoomId);
            });

            this.client.on('message', async (data) => {
                try {
                    console.log('收到消息，长度：', data.length);
                    const packets = await parseResponse(data);
                    for (const packet of packets) {
                        console.log('解析到数据包：', {
                            op: packet.op,
                            bodyLength: packet.body ? packet.body.length : 0
                        });
                        
                        if (packet.op === 8) {
                            this.authenticated = true;
                            console.log('认证成功，开始发送心跳包');
                            this.startHeartbeat();
                            this.sendToFrontend({
                                type: 'connected',
                                message: `已连接到直播间 ${realRoomId}`
                            });
                        } else if (packet.op === 3) {
                            console.log('收到心跳包回应');
                        } else if (packet.op === 5 && packet.body) {
                            try {
                                const body = JSON.parse(packet.body);
                                if (body.cmd === 'DANMU_MSG') {
                                    this.handleDanmaku(body);
                                }
                            } catch (e) {
                                console.error('解析弹幕消息失败：', e);
                            }
                        }
                    }
                } catch (error) {
                    console.error('处理消息失败：', error);
                }
            });

            this.client.on('close', (code, reason) => {
                console.log(`WebSocket连接关闭，代码：${code}，原因：${reason || '未知'}`);
                this.cleanup();
                
                if (!this.authenticated && this.reconnectAttempts < this.maxReconnectAttempts) {
                    this.reconnectAttempts++;
                    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
                    console.log(`将在 ${delay/1000} 秒后尝试第 ${this.reconnectAttempts} 次重连...`);
                    setTimeout(() => this.connect(), delay);
                } else {
                    this.sendToFrontend({
                        type: 'disconnected',
                        message: `与直播间 ${realRoomId} 的连接已断开`
                    });
                }
            });

            this.client.on('error', (error) => {
                console.error(`WebSocket错误：`, error);
                this.cleanup();
                this.sendToFrontend({
                    type: 'error',
                    message: `连接错误: ${error.message}`
                });
            });

        } catch (error) {
            console.error('连接直播间失败：', error);
            this.sendToFrontend({
                type: 'error',
                message: `连接失败: ${error.message}`
            });
        }
    }

    sendAuth(roomId) {
        if (this.client && this.client.readyState === WebSocket.OPEN) {
            try {
                const authPacket = generateAuthPacket(roomId);
                this.client.send(authPacket);
                console.log('已发送认证包');
            } catch (error) {
                console.error('发送认证包失败：', error);
                this.cleanup();
            }
        } else {
            console.error('WebSocket未连接，无法发送认证包');
        }
    }

    startHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
        }
        
        // 立即发送一次心跳包
        this.sendHeartbeat();
        
        this.heartbeatInterval = setInterval(() => {
            this.sendHeartbeat();
        }, 30000);
    }

    sendHeartbeat() {
        if (this.client && this.client.readyState === WebSocket.OPEN) {
            try {
                const heartbeatPacket = generateHeartbeatPacket();
                this.client.send(heartbeatPacket);
                console.log('已发送心跳包');
            } catch (error) {
                console.error('发送心跳包失败：', error);
            }
        } else {
            console.error('WebSocket未连接，无法发送心跳包');
        }
    }

    handleDanmaku(body) {
        const info = body.info;
        const danmaku = {
            type: 'danmaku',
            timestamp: Date.now(),
            content: info[1],
            user: {
                uid: info[2][0],
                name: info[2][1],
                isAdmin: info[2][2] === 1,
                isVip: info[2][3] === 1,
                isSvip: info[2][4] === 1,
                level: info[4][0],
                medal: info[3],
                title: info[5] ? info[5][0] : '',
            },
            weight: this.calculateWeight(info)
        };
        this.sendToFrontend(danmaku);
    }

    calculateWeight(info) {
        let weight = 10;
        weight += Math.min(info[4][0], 40);
        if (info[2][2] === 1) weight += 50;
        if (info[7]) weight += 30;
        if (info[3]) weight += Math.min(info[3][0], 30);
        if (info[2][3] === 1) weight += 10;
        if (info[2][4] === 1) weight += 20;
        return weight;
    }

    sendToFrontend(data) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(data));
        }
    }

    cleanup() {
        this.authenticated = false;
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
        if (this.client) {
            this.client.close();
            this.client = null;
        }
    }

    disconnect() {
        this.cleanup();
    }
}

// WebSocket服务器
const wss = new WebSocketServer({ port: 8080 });

wss.on('connection', (ws) => {
    console.log('新的前端连接已建立');
    let danmakuClient = null;

    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message.toString());
            console.log('收到前端消息：', data);

            if (data.type === 'join') {
                // 如果已有连接，先断开
                if (danmakuClient) {
                    danmakuClient.disconnect();
                }
                // 创建新连接
                danmakuClient = new DanmakuClient(data.roomId, ws);
                await danmakuClient.connect();
            }
        } catch (error) {
            console.error('处理前端消息失败：', error);
            ws.send(JSON.stringify({
                type: 'error',
                message: '处理请求失败'
            }));
        }
    });

    ws.on('close', () => {
        console.log('前端连接已断开');
        if (danmakuClient) {
            danmakuClient.disconnect();
            danmakuClient = null;
        }
    });
});

// HTTP服务器
app.get('/', (req, res) => {
    res.send('弹幕筛选服务器正在运行');
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`HTTP服务器运行在 http://localhost:${PORT}`);
    console.log(`WebSocket服务器运行在 ws://localhost:8080`);
}); 