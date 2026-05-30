const fetalImages: Record<number, ReturnType<typeof require>> = {
  4: require("@/assets/images/fetal-week-04.png"),
  8: require("@/assets/images/fetal-week-08.png"),
  12: require("@/assets/images/fetal-week-12.png"),
  16: require("@/assets/images/fetal-week-16.png"),
  20: require("@/assets/images/fetal-week-20.png"),
  24: require("@/assets/images/fetal-week-24.png"),
  28: require("@/assets/images/fetal-week-28.png"),
  32: require("@/assets/images/fetal-week-32.png"),
  36: require("@/assets/images/fetal-week-36.png"),
  40: require("@/assets/images/fetal-week-40.png"),
};

export function getFetalImage(week: number): ReturnType<typeof require> {
  if (week <= 5) return fetalImages[4];
  if (week <= 9) return fetalImages[8];
  if (week <= 13) return fetalImages[12];
  if (week <= 17) return fetalImages[16];
  if (week <= 21) return fetalImages[20];
  if (week <= 25) return fetalImages[24];
  if (week <= 29) return fetalImages[28];
  if (week <= 33) return fetalImages[32];
  if (week <= 37) return fetalImages[36];
  return fetalImages[40];
}
