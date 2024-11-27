<template>
  <div class="app">
    <div class="box1">
      <div class="input-section">
        <span>直播间ID：</span>
        <input 
          type="text" 
          v-model="roomId" 
          placeholder="请输入直播间ID，如：5360662"
          @keyup.enter="connectToRoom"
        />
        <button 
          @click="connectToRoom" 
          :disabled="loading"
          :class="{ 'connected': isConnected }"
        >
          {{ connectionButtonText }}
        </button>
      </div>
      <div v-if="error" class="error-message">
        {{ error }}
      </div>
      <div class="filter-section">
        <div class="filter-group">
          <h3>基础设置</h3>
          <div class="filter-item">
            <span>最低权重</span>
            <input type="number" v-model="minWeight" min="0" />
          </div>
          <div class="filter-item">
            <span>同屏密度</span>
            <input type="number" v-model="max" min="0" />
          </div>
          <div class="filter-item">
            <span>去重</span>
            <input type="checkbox" v-model="needDistinct" />
          </div>
        </div>

        <div class="filter-group">
          <h3>关键词屏蔽</h3>
          <div class="shield-list">
            <div
              v-for="(item, index) in shieldWords"
              :key="index"
              class="shield-item"
            >
              <span class="shield-text">{{ item }}</span>
              <button
                class="remove-button"
                @click="removeShieldItem(shieldWords, index)"
              >
                ×
              </button>
            </div>
          </div>
          <div class="input-group">
            <input 
              type="text" 
              v-model="inputShieldWord" 
              @keyup.enter="addShieldWord"
              placeholder="输入关键词后回车添加"
            />
            <button @click="addShieldWord">添加</button>
          </div>
        </div>

        <div class="filter-group">
          <h3>用户屏蔽</h3>
          <div class="shield-list">
            <div
              v-for="(item, index) in shieldUsers"
              :key="index"
              class="shield-item"
            >
              <span class="shield-text">{{ item }}</span>
              <button
                class="remove-button"
                @click="removeShieldItem(shieldUsers, index)"
              >
                ×
              </button>
            </div>
          </div>
          <div class="input-group">
            <input 
              type="text" 
              v-model="inputShieldUser" 
              @keyup.enter="addShieldUser"
              placeholder="输入用户ID后回车添加"
            />
            <button @click="addShieldUser">添加</button>
          </div>
        </div>

        <div class="filter-group">
          <h3>正则屏蔽</h3>
          <div class="shield-list">
            <div
              v-for="(item, index) in shieldRegulars"
              :key="index"
              class="shield-item"
            >
              <span class="shield-text">{{ item }}</span>
              <button
                class="remove-button"
                @click="removeShieldItem(shieldRegulars, index)"
              >
                ×
              </button>
            </div>
          </div>
          <div class="input-group">
            <input 
              type="text" 
              v-model="inputShieldRegular" 
              @keyup.enter="addShieldRegular"
              placeholder="输入正则表达式后回车添加"
            />
            <button @click="addShieldRegular">添加</button>
          </div>
        </div>
      </div>
    </div>

    <div class="box2">
      <div class="stats">
        <div>接收弹幕：{{ totalMessages }} 条</div>
        <div>筛选通过：{{ filteredMessages.length }} 条</div>
        <button class="clear-button" @click="clearMessages">清空消息</button>
      </div>
      <div class="scroll-box" ref="scrollBox">
        <div
          v-for="(item, index) in filteredMessages"
          :key="index"
          class="danmaku-box"
          :class="{ 'important': item.weight >= 50 }"
        >
          <div class="danmaku-meta">
            <span class="time">{{ formatTime(item.timestamp) }}</span>
            <span class="weight">[{{ item.weight }}]</span>
          </div>
          <div class="user-info">
            <span class="user-name" :class="{ 
              'admin': item.user.isAdmin,
              'vip': item.user.isVip,
              'svip': item.user.isSvip
            }">{{ item.user.name }}</span>
            <span v-if="item.user.medal" class="medal">
              [{{ item.user.medal.name }}:{{ item.user.medal.level }}]
            </span>
            <span class="user-level">UL{{ item.user.level }}</span>
          </div>
          <div class="message">{{ item.content }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue';

const roomId = ref('');
const loading = ref(false);
const error = ref('');
const isConnected = ref(false);
const ws = ref(null);
const messages = ref([]);
const needDistinct = ref(false);
const minWeight = ref(10);
const max = ref(0);
const shieldWords = ref([]);
const inputShieldWord = ref('');
const shieldUsers = ref([]);
const inputShieldUser = ref('');
const shieldRegulars = ref([]);
const inputShieldRegular = ref('');
const scrollBox = ref(null);
const autoScroll = ref(true);

const connectionButtonText = computed(() => {
  if (loading.value) return '连接中...';
  if (isConnected.value) return '断开连接';
  return '连接直播间';
});

const totalMessages = computed(() => messages.value.length);

const filteredMessages = computed(() => {
  let result = messages.value;

  // 权重过滤
  result = result.filter(msg => msg.weight >= minWeight.value);

  // 去重
  if (needDistinct.value) {
    const seen = new Set();
    result = result.filter(msg => {
      if (seen.has(msg.content)) return false;
      seen.add(msg.content);
      return true;
    });
  }

  // 关键词屏蔽
  if (shieldWords.value.length) {
    result = result.filter(msg => 
      !shieldWords.value.some(word => msg.content.includes(word))
    );
  }

  // 用户屏蔽
  if (shieldUsers.value.length) {
    result = result.filter(msg => 
      !shieldUsers.value.includes(msg.user.name)
    );
  }

  // 正则屏蔽
  if (shieldRegulars.value.length) {
    result = result.filter(msg => 
      !shieldRegulars.value.some(pattern => {
        try {
          const regex = new RegExp(pattern);
          return regex.test(msg.content);
        } catch {
          return false;
        }
      })
    );
  }

  // 同屏密度限制
  if (max.value > 0) {
    const groups = {};
    result.forEach(msg => {
      const second = Math.floor(msg.timestamp);
      if (!groups[second]) groups[second] = [];
      groups[second].push(msg);
    });

    result = Object.values(groups).flatMap(group => 
      group.slice(0, max.value)
    );
  }

  return result.sort((a, b) => b.timestamp - a.timestamp);
});

const formatTime = (timestamp) => {
  const date = new Date(timestamp * 1000);
  return date.toLocaleTimeString('zh-CN', { 
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
};

// 从URL中提取房间号
const extractRoomId = (url) => {
  if (!url) return '';
  
  // 如果是纯数字，直接返回
  if (/^\d+$/.test(url)) {
    return url;
  }
  
  // 尝试从URL中提取
  try {
    const match = url.match(/live\.bilibili\.com\/(\d+)/);
    return match ? match[1] : '';
  } catch (e) {
    return '';
  }
};

const connectToRoom = () => {
  if (isConnected.value) {
    disconnectFromRoom();
    return;
  }

  const extractedRoomId = extractRoomId(roomId.value);
  if (!extractedRoomId) {
    error.value = '请输入正确的直播间ID或链接';
    return;
  }

  loading.value = true;
  error.value = '';

  try {
    ws.value = new WebSocket('ws://localhost:8080');

    ws.value.onopen = () => {
      console.log('连接到弹幕服务器');
      ws.value.send(JSON.stringify({
        type: 'join',
        roomId: extractedRoomId
      }));
      isConnected.value = true;
      loading.value = false;
    };

    ws.value.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'danmaku') {
        messages.value.unshift(data);
        if (messages.value.length > 200) {
          messages.value = messages.value.slice(0, 200);
        }
      } else if (data.type === 'error') {
        error.value = data.message;
        disconnectFromRoom();
      }
    };

    ws.value.onclose = () => {
      console.log('与弹幕服务器断开连接');
      isConnected.value = false;
      loading.value = false;
    };

    ws.value.onerror = (e) => {
      console.error('WebSocket错误：', e);
      error.value = '连接错误，请确保服务器正在运行';
      loading.value = false;
      isConnected.value = false;
    };
  } catch (e) {
    console.error('连接失败：', e);
    error.value = '连接失败，请确保服务器正在运行';
    loading.value = false;
    isConnected.value = false;
  }
};

const disconnectFromRoom = () => {
  if (ws.value) {
    ws.value.close();
    ws.value = null;
  }
  isConnected.value = false;
  loading.value = false;
};

const addShieldWord = () => {
  if (inputShieldWord.value.trim()) {
    shieldWords.value.push(inputShieldWord.value.trim());
    inputShieldWord.value = '';
  }
};

const addShieldUser = () => {
  if (inputShieldUser.value.trim()) {
    shieldUsers.value.push(inputShieldUser.value.trim());
    inputShieldUser.value = '';
  }
};

const addShieldRegular = () => {
  if (inputShieldRegular.value.trim()) {
    try {
      new RegExp(inputShieldRegular.value.trim());
      shieldRegulars.value.push(inputShieldRegular.value.trim());
      inputShieldRegular.value = '';
    } catch (err) {
      error.value = '无效的正则表达式';
    }
  }
};

const removeShieldItem = (list, index) => {
  list.splice(index, 1);
};

const clearMessages = () => {
  messages.value = [];
};

onUnmounted(() => {
  disconnectFromRoom();
});
</script>

<style scoped>
.app {
  display: flex;
  padding: 20px;
  gap: 20px;
  max-width: 1400px;
  margin: 0 auto;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
}

.box1 {
  width: 300px;
  display: flex;
  flex-direction: column;
  gap: 15px;
}

.box2 {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.input-section {
  display: flex;
  gap: 10px;
  align-items: center;
}

.error-message {
  color: #ff4d4f;
  padding: 10px;
  background: #fff2f0;
  border: 1px solid #ffccc7;
  border-radius: 4px;
}

.filter-section {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.filter-group {
  background: #f5f5f5;
  border-radius: 8px;
  padding: 15px;
}

.filter-group h3 {
  margin: 0 0 10px 0;
  font-size: 16px;
  color: #333;
}

.filter-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.shield-list {
  max-height: 150px;
  overflow-y: auto;
  margin-bottom: 10px;
}

.shield-item {
  display: flex;
  align-items: center;
  background: white;
  padding: 5px 10px;
  margin: 5px 0;
  border-radius: 4px;
}

.shield-text {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
}

.remove-button {
  padding: 0 8px;
  background: none;
  color: #ff4d4f;
  font-size: 18px;
}

.remove-button:hover {
  background: #fff2f0;
}

.stats {
  display: flex;
  align-items: center;
  gap: 20px;
  padding: 10px;
  background: #f5f5f5;
  border-radius: 8px;
}

.scroll-box {
  flex: 1;
  height: calc(100vh - 140px);
  overflow-y: auto;
  border: 1px solid #eee;
  border-radius: 8px;
  padding: 10px;
  background: white;
}

.danmaku-box {
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding: 8px;
  border-bottom: 1px solid #f0f0f0;
  transition: background-color 0.3s;
}

.danmaku-box:hover {
  background: #f5f5f5;
}

.danmaku-box.important {
  background: #f6ffed;
  border-left: 3px solid #52c41a;
}

.danmaku-meta {
  display: flex;
  gap: 10px;
  color: #666;
  font-size: 12px;
}

.user-info {
  display: flex;
  gap: 8px;
  align-items: center;
}

.user-name {
  color: #1890ff;
  font-weight: 500;
}

.user-name.admin {
  color: #ff4d4f;
}

.user-name.vip {
  color: #722ed1;
}

.user-name.svip {
  color: #eb2f96;
}

.medal {
  background: #f0f0f0;
  padding: 1px 6px;
  border-radius: 3px;
  font-size: 12px;
}

.user-level {
  color: #666;
  font-size: 12px;
}

.message {
  color: #333;
  line-height: 1.5;
}

.weight {
  color: #faad14;
}

button {
  padding: 4px 12px;
  background: #1890ff;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.3s;
}

button:hover {
  background: #40a9ff;
}

button:disabled {
  background: #d9d9d9;
  cursor: not-allowed;
}

button.connected {
  background: #ff4d4f;
}

button.connected:hover {
  background: #ff7875;
}

.clear-button {
  background: #ff4d4f;
  margin-left: auto;
}

.clear-button:hover {
  background: #ff7875;
}

input[type="text"],
input[type="number"] {
  padding: 4px 8px;
  border: 1px solid #d9d9d9;
  border-radius: 4px;
  transition: all 0.3s;
}

input[type="text"]:focus,
input[type="number"]:focus {
  border-color: #40a9ff;
  outline: none;
  box-shadow: 0 0 0 2px rgba(24, 144, 255, 0.2);
}

input[type="checkbox"] {
  width: 16px;
  height: 16px;
  margin-left: 8px;
}

.input-group {
  display: flex;
  gap: 10px;
}

.input-group input {
  flex: 1;
}
</style>
