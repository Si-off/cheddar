import { randomInt } from "node:crypto";

const actions = [
  "춤추는",
  "졸린",
  "달리는",
  "노래하는",
  "꼼꼼한",
  "웃는",
  "꿈꾸는",
  "산책하는",
  "책읽는",
  "그림그리는",
  "생각하는",
  "여행하는",
  "수영하는",
  "연주하는",
  "요리하는",
  "명상하는",
  "장난치는",
  "응원하는",
  "반짝이는",
  "용감한",
  "다정한",
  "씩씩한",
  "차분한",
  "부지런한",
  "호기심많은",
  "친절한",
  "행복한",
  "신나는",
  "지혜로운",
  "기지개켜는",
  "인사하는",
  "박수치는",
];
const animals = [
  "수달",
  "판다",
  "치타",
  "고래",
  "너구리",
  "토끼",
  "여우",
  "곰",
  "사슴",
  "호랑이",
  "사자",
  "펭귄",
  "물개",
  "바다사자",
  "돌고래",
  "다람쥐",
  "고양이",
  "강아지",
  "코끼리",
  "기린",
  "얼룩말",
  "하마",
  "코알라",
  "캥거루",
  "알파카",
  "라마",
  "고슴도치",
  "부엉이",
  "참새",
  "독수리",
  "두루미",
  "거북이",
];
export function visitorName(existing: Set<string>) {
  const count = actions.length * animals.length;
  const start = randomInt(count);
  for (let suffix = 0; ; suffix++) {
    for (let offset = 0; offset < count; offset++) {
      const index = (start + offset) % count;
      const name = `${actions[Math.floor(index / animals.length)]} ${animals[index % animals.length]}${suffix ? ` ${suffix + 1}` : ""}`;
      if (!existing.has(name)) return name;
    }
  }
}
