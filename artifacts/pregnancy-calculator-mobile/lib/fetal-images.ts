import type { ImageSourcePropType } from "react-native";

const fetalImages: Record<number, ImageSourcePropType> = {
  4: require("@/assets/images/fetal-week-04.png") as ImageSourcePropType,
  8: require("@/assets/images/fetal-week-08.png") as ImageSourcePropType,
  12: require("@/assets/images/fetal-week-12.png") as ImageSourcePropType,
  16: require("@/assets/images/fetal-week-16.png") as ImageSourcePropType,
  20: require("@/assets/images/fetal-week-20.png") as ImageSourcePropType,
  24: require("@/assets/images/fetal-week-24.png") as ImageSourcePropType,
  28: require("@/assets/images/fetal-week-28.png") as ImageSourcePropType,
  32: require("@/assets/images/fetal-week-32.png") as ImageSourcePropType,
  36: require("@/assets/images/fetal-week-36.png") as ImageSourcePropType,
  40: require("@/assets/images/fetal-week-40.png") as ImageSourcePropType,
};

export function getFetalImage(week: number): ImageSourcePropType {
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
