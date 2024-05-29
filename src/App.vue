<template>
  <div class="app">
    <div class="box1">
      <div>
        <span>去重</span>
        <input type="checkbox" v-model="needDistinct" />
      </div>
      <div>
        <span>屏蔽等级</span>
        <input type="number" v-model="level" />
      </div>
      <div>
        <span>同屏密度</span>
        <input type="number" v-model="max" />
      </div>
      <div>
        <span>关键词屏蔽</span>
        <div>
          <div
            v-for="(item, index) in shieldWords"
            :key="index"
            class="shieldListItem"
          >
            <div class="shieldListItemText">{{ item }}</div>
            <button
              class="shieldListItemBtn"
              @click="removeShieldItem(shieldWords, index)"
            >
              移除
            </button>
          </div>
        </div>
        <input type="text" v-model="inputShieldWord" />
        <button @click="addShieldWord">添加</button>
      </div>
      <div>
        <span>用户屏蔽</span>
        <div>
          <div
            v-for="(item, index) in shieldUsers"
            :key="index"
            class="shieldListItem"
          >
            <div class="shieldListItemText">{{ item }}</div>
            <button
              class="shieldListItemBtn"
              @click="removeShieldItem(shieldUsers, index)"
            >
              移除
            </button>
          </div>
        </div>
        <input type="text" v-model="inputShieldUser" />
        <button @click="addShieldUser">添加</button>
      </div>
      <div>
        <span>正则屏蔽</span>
        <div>
          <div
            v-for="(item, index) in shieldRegulars"
            :key="index"
            class="shieldListItem"
          >
            <div class="shieldListItemText">{{ item }}</div>
            <button
              class="shieldListItemBtn"
              @click="removeShieldItem(shieldRegulars, index)"
            >
              移除
            </button>
          </div>
        </div>
        <input type="text" v-model="inputShieldRegular" />
        <button @click="addShieldRegular">添加</button>
      </div>
      <div>
        <button @click="filterFrostDanmaku">计算</button>
      </div>
    </div>

    <div class="box2">
      <div>原始弹幕：数量{{ danmakuList[0].list.length }}</div>
      <div>计算结果：数量{{ outputDanmaku.length }}</div>
      <div class="scroll-box">
        <div
          v-for="(item, index) in outputDanmaku"
          :key="index"
          class="danmakuBox"
        >
          <div>{{ item.MidHash }} :</div>
          <div>{{ item.Text }} :</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import {
  ref,
  onMounted,
  onBeforeUnmount,
  nextTick,
  getCurrentInstance,
} from "vue";
import Enumerable from "linq";
import danmakuList from "./danmakuList";

console.warn(danmakuList);

/** 是否去重 */
const needDistinct = ref(false);

/** 屏蔽等级 */
const level = ref(0);

/** 同屏密度 */
const max = ref(0);

// 关键词
const shieldWords = ref([]);

const inputShieldWord = ref("");

const addShieldWord = () => {
  shieldWords.value.push(inputShieldWord.value);
};

// 用户
const shieldUsers = ref([]);

const inputShieldUser = ref("");

const addShieldUser = () => {
  shieldUsers.value.push(inputShieldUser.value);
};

// 正则
const shieldRegulars = ref([]);

const inputShieldRegular = ref("");

const addShieldRegular = () => {
  shieldRegulars.value.push(inputShieldRegular.value);
};

const removeShieldItem = (shieldList, shieldItemIndex) => {
  shieldList.splice(shieldItemIndex, 1);
};

//  输出弹幕
const outputDanmaku = ref([]);

const filterFrostDanmaku = () => {
  let result;

  let danmakus = Enumerable.from(danmakuList[0].list);

  // 云屏蔽
  danmakus = danmakus.where((x) => x.Weight >= level.value);

  // 去重
  if (needDistinct.value) {
    danmakus = danmakus.distinct((x) => x.Text);
  }

  // 关键词
  Enumerable.from(shieldWords.value).forEach((item) => {
    danmakus = danmakus.where((x) => !x.Text.includes(item));
  });

  // 用户
  Enumerable.from(shieldUsers.value).forEach((item) => {
    danmakus = danmakus.where((x) => x.MidHash !== item);
  });

  // 正则
  Enumerable.from(shieldRegulars.value).forEach((item) => {
    var regex = new RegExp(item);
    danmakus = danmakus.where((x) => !regex.test(x.Text));
  });

  // 同屏密度
  if (max.value > 0) {
    danmakus = danmakus
      .groupBy((x) => Math.floor(x.StartMs / 1000) * 1000)
      .selectMany((group) =>
        Enumerable.from(group.getSource()).take(max.value)
      );
  }

  result = danmakus.toArray();
  console.warn(result);

  outputDanmaku.value = result;
};
</script>

<style scoped>
.app {
  display: flex;
}

.box1 {
  width: 18rem;
}

.scroll-box {
  width: 500px; /* 固定宽度 */
  height: 900px; /* 固定高度 */
  overflow-y: scroll; /* 垂直滚动 */
  border: 1px solid #ccc;
}

.shieldListItem {
  display: flex;
  flex-direction: row;
}

.shieldListItemText {
  flex: auto;
  overflow: hidden;
  word-wrap: break-word;
  word-break: break-all;
}

.shieldListItemBtn {
  margin: 0;
  padding: 0;
  width: 5rem;
}

.danmakuBox {
  display: flex;
}
</style>
