export const VIDEO_VAULT_TOPIC_IDS = [
  "fetal-development",
  "preconception",
  "prenatal-care",
  "vaccines",
  "infections",
  "hypertension",
  "bleeding-preterm",
  "mental-health",
  "medications",
  "labor-delivery",
  "postpartum-recovery",
  "postpartum-warning",
  "newborn-care",
  "newborn-bonding",
  "breastfeeding",
  "safe-sleep",
] as const;

export type VideoVaultTopicId = (typeof VIDEO_VAULT_TOPIC_IDS)[number];

export type SupportPersonVolumeNumber = 1 | 2 | 3;
