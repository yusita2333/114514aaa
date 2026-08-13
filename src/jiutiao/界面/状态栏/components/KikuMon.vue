<!--
  KikuMon · 菊家纹（十六瓣菊·极道/家纹意象）
  内联矢量 SVG，随 currentColor 变色（白天金/夜晚绯红），无外链依赖、无版权问题。
  用作行动格的极道符文（取代原来的序号数标）。参考:日本菊家纹(kikumon)公共域意象。
-->
<template>
  <svg class="kiku" viewBox="0 0 100 100" aria-hidden="true">
    <g fill="currentColor">
      <!-- 外层16瓣 -->
      <path v-for="a in ANGLES" :key="'o' + a" :transform="`rotate(${a} 50 50)`"
        d="M50 5 C 54 18, 54 32, 50 42 C 46 32, 46 18, 50 5 Z" />
      <!-- 内层16瓣（错开半个夹角·稍短） -->
      <path v-for="a in ANGLES" :key="'i' + a" :transform="`rotate(${a + 11.25} 50 50)`" opacity="0.85"
        d="M50 24 C 52.6 32, 52.6 40, 50 46 C 47.4 40, 47.4 32, 50 24 Z" />
      <!-- 花心 -->
      <circle cx="50" cy="50" r="9" />
    </g>
    <circle cx="50" cy="50" r="3.4" fill="var(--ink)" />
  </svg>
</template>

<script setup lang="ts">
// 16 瓣：0,22.5,45,...,337.5
const ANGLES = Array.from({ length: 16 }, (_, i) => i * 22.5);
</script>

<style scoped>
.kiku { display: block; width: 100%; height: 100%; }
</style>
