// Stable IDs are stored in accounts; assets ship with the frontend and work offline.
export const avatars = [
  ["cat", "小橘猫"],
  ["dog", "小狗"],
  ["rabbit", "小兔"],
  ["bear", "小熊"],
  ["panda", "熊猫"],
  ["fox", "狐狸"],
  ["koala", "考拉"],
  ["frog", "青蛙"],
  ["penguin", "企鹅"],
  ["owl", "猫头鹰"],
  ["pig", "小猪"],
  ["tiger", "小老虎"],
  ["lion", "狮子"],
  ["mouse", "小鼠"],
  ["raccoon", "浣熊"],
  ["chick", "小鸡"],
].map(([id, name]) => ({ id, name, src: `/avatars/${id}.svg` }));
export const avatarIds = avatars.map(({ id }) => id);
export const avatarFor = (id) =>
  avatars.find((avatar) => avatar.id === id) || avatars[0];
