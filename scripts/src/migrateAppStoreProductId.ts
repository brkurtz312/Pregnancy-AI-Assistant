import { getUncachableRevenueCatClient } from "./revenueCatClient";
import {
  listProjects,
  listApps,
  listProducts,
  createProduct,
  listEntitlements,
  attachProductsToEntitlement,
  detachProductsFromEntitlement,
  listOfferings,
  listPackages,
  attachProductsToPackage,
  detachProductsFromPackage,
  archiveProduct,
  type CreateProductData,
} from "@replit/revenuecat-sdk";

// Apple permanently reserves IAP product IDs once used. The original
// `full_pregnancy_pass` was burned on the orphan app, so the live App Store
// IAP is now `full_pregnancy_pass_v2`. This script swaps ONLY the App Store
// product in RevenueCat to match; Play Store + Test Store stay unchanged.
const PROJECT_NAME = "Pregnancy Assistant";
const OLD_STORE_ID = "full_pregnancy_pass";
const NEW_STORE_ID = "full_pregnancy_pass_v2";
const NEW_DISPLAY_NAME = "Full Pregnancy Pass (App Store v2)";
const ENTITLEMENT_IDENTIFIER = "pass";
const OFFERING_IDENTIFIER = "default";
const PACKAGE_IDENTIFIER = "$rc_lifetime";

async function migrate() {
  const client = await getUncachableRevenueCatClient();

  const { data: projects, error: projErr } = await listProjects({
    client,
    query: { limit: 20 },
  });
  if (projErr) throw new Error("Failed to list projects");
  const project = projects.items?.find((p) => p.name === PROJECT_NAME);
  if (!project) throw new Error(`Project '${PROJECT_NAME}' not found`);
  console.log("Project:", project.name, project.id);

  const { data: apps, error: appsErr } = await listApps({
    client,
    path: { project_id: project.id },
    query: { limit: 50 },
  });
  if (appsErr) throw new Error("Failed to list apps");
  const appStoreApp = apps.items.find((a) => a.type === "app_store");
  if (!appStoreApp) throw new Error("No App Store app found");
  console.log("App Store app:", appStoreApp.id);

  const { data: products, error: prodErr } = await listProducts({
    client,
    path: { project_id: project.id },
    query: { limit: 100 },
  });
  if (prodErr) throw new Error("Failed to list products");

  const oldProduct = products.items.find(
    (p) =>
      p.store_identifier === OLD_STORE_ID && p.app_id === appStoreApp.id,
  );
  let newProduct = products.items.find(
    (p) =>
      p.store_identifier === NEW_STORE_ID && p.app_id === appStoreApp.id,
  );

  if (newProduct) {
    console.log("New App Store product already exists:", newProduct.id);
  } else {
    const body: CreateProductData["body"] = {
      store_identifier: NEW_STORE_ID,
      app_id: appStoreApp.id,
      type: "non_consumable",
      display_name: NEW_DISPLAY_NAME,
    };
    const { data: created, error } = await createProduct({
      client,
      path: { project_id: project.id },
      body,
    });
    if (error)
      throw new Error(
        "Failed to create new App Store product: " + JSON.stringify(error),
      );
    newProduct = created;
    console.log("Created new App Store product:", newProduct.id);
  }

  // Resolve entitlement + package.
  const { data: entitlements, error: entErr } = await listEntitlements({
    client,
    path: { project_id: project.id },
    query: { limit: 20 },
  });
  if (entErr) throw new Error("Failed to list entitlements");
  const entitlement = entitlements.items?.find(
    (e) => e.lookup_key === ENTITLEMENT_IDENTIFIER,
  );
  if (!entitlement)
    throw new Error(`Entitlement '${ENTITLEMENT_IDENTIFIER}' not found`);

  const { data: offerings, error: offErr } = await listOfferings({
    client,
    path: { project_id: project.id },
    query: { limit: 20 },
  });
  if (offErr) throw new Error("Failed to list offerings");
  const offering = offerings.items.find(
    (o) => o.lookup_key === OFFERING_IDENTIFIER,
  );
  if (!offering) throw new Error(`Offering '${OFFERING_IDENTIFIER}' not found`);

  const { data: packages, error: pkgErr } = await listPackages({
    client,
    path: { project_id: project.id, offering_id: offering.id },
    query: { limit: 20 },
  });
  if (pkgErr) throw new Error("Failed to list packages");
  const pkg = packages.items.find((p) => p.lookup_key === PACKAGE_IDENTIFIER);
  if (!pkg) throw new Error(`Package '${PACKAGE_IDENTIFIER}' not found`);

  // Detach the old App Store product from package + entitlement so the new
  // one can take its place (a package allows one product per app).
  if (oldProduct) {
    const { error: dpErr } = await detachProductsFromPackage({
      client,
      path: { project_id: project.id, package_id: pkg.id },
      body: { product_ids: [oldProduct.id] },
    });
    if (dpErr) console.log("Detach from package (ignored):", dpErr.type);
    else console.log("Detached old product from package");

    const { error: deErr } = await detachProductsFromEntitlement({
      client,
      path: { project_id: project.id, entitlement_id: entitlement.id },
      body: { product_ids: [oldProduct.id] },
    });
    if (deErr) console.log("Detach from entitlement (ignored):", deErr.type);
    else console.log("Detached old product from entitlement");
  }

  // Attach the new product.
  const { error: aeErr } = await attachProductsToEntitlement({
    client,
    path: { project_id: project.id, entitlement_id: entitlement.id },
    body: { product_ids: [newProduct.id] },
  });
  if (aeErr && aeErr.type !== "unprocessable_entity_error")
    throw new Error("Failed to attach new product to entitlement");
  console.log("Attached new product to entitlement");

  const { error: apErr } = await attachProductsToPackage({
    client,
    path: { project_id: project.id, package_id: pkg.id },
    body: {
      products: [{ product_id: newProduct.id, eligibility_criteria: "all" }],
    },
  });
  if (apErr && apErr.type !== "unprocessable_entity_error")
    throw new Error("Failed to attach new product to package");
  console.log("Attached new product to package");

  // Archive the old, now-orphaned App Store product.
  if (oldProduct) {
    const { error: arErr } = await archiveProduct({
      client,
      path: { project_id: project.id, product_id: oldProduct.id },
    });
    if (arErr) console.log("Archive old product (ignored):", arErr.type);
    else console.log("Archived old App Store product:", oldProduct.id);
  }

  console.log("\nDone. App Store product is now", NEW_STORE_ID);
}

migrate().catch((e) => {
  console.error(e);
  process.exit(1);
});
