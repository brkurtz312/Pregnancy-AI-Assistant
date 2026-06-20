import { getUncachableRevenueCatClient } from "./revenueCatClient";
import {
  listProjects,
  listApps,
  listProducts,
  listOfferings,
} from "@replit/revenuecat-sdk";

async function check() {
  const client = await getUncachableRevenueCatClient();

  const { data: projects, error: projErr } = await listProjects({
    client,
    query: { limit: 20 },
  });
  if (projErr) throw new Error("Failed to list projects");
  const project = projects.items?.find((p) => p.name === "Pregnancy Assistant");
  if (!project) {
    console.log(
      "Projects:",
      projects.items?.map((p) => `${p.name} (${p.id})`),
    );
    throw new Error("Project 'Pregnancy Assistant' not found");
  }
  console.log("Project:", project.name, project.id);

  const { data: apps, error: appsErr } = await listApps({
    client,
    path: { project_id: project.id },
    query: { limit: 50 },
  });
  if (appsErr) throw new Error("Failed to list apps");
  console.log("\n=== APPS ===");
  for (const a of apps.items) {
    const detail =
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (a as any).app_store?.bundle_id ??
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (a as any).play_store?.package_name ??
      "(test store)";
    console.log(`- ${a.type} | id=${a.id} | name=${a.name} | ${detail}`);
  }

  const { data: products, error: prodErr } = await listProducts({
    client,
    path: { project_id: project.id },
    query: { limit: 100 },
  });
  if (prodErr) throw new Error("Failed to list products");
  console.log("\n=== PRODUCTS ===");
  for (const p of products.items) {
    console.log(
      `- store_id=${p.store_identifier} | type=${p.type} | app_id=${p.app_id} | id=${p.id}`,
    );
  }

  const { data: offerings, error: offErr } = await listOfferings({
    client,
    path: { project_id: project.id },
    query: { limit: 20 },
  });
  if (offErr) throw new Error("Failed to list offerings");
  console.log("\n=== OFFERINGS ===");
  for (const o of offerings.items) {
    console.log(
      `- lookup_key=${o.lookup_key} | is_current=${o.is_current} | id=${o.id}`,
    );
  }
}

check().catch(console.error);
