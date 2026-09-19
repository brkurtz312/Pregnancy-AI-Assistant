/**
 * Verifies that the RevenueCat credential in the environment can make every
 * call the API server makes at runtime -- not just the ones that read project
 * configuration.
 *
 * The revenue path is Apple IAP -> RevenueCat -> `/billing/revenuecat/reconcile`,
 * and that endpoint reads *customer* data (`listEntitlements` +
 * `listCustomerActiveEntitlements`). A key scoped to Project configuration
 * alone lists apps, products and offerings happily and then answers 503 on
 * every purchase. So this script exercises both permission domains and exits
 * non-zero if either is unusable.
 *
 *   pnpm --filter @workspace/scripts run check-revenuecat [customer_id]
 *
 * The customer id is optional: without one the script picks the first customer
 * the project reports. Pass one (or set REVENUECAT_CHECK_CUSTOMER_ID) to check
 * a specific user, e.g. the App Review demo account.
 */
import { getUncachableRevenueCatClient } from "./revenueCatClient";
import {
  listProjects,
  listApps,
  listProducts,
  listOfferings,
  listEntitlements,
  listCustomers,
  listCustomerActiveEntitlements,
} from "@replit/revenuecat-sdk";

const PROJECT_NAME = "Pregnancy Assistant";

/**
 * Mirrors REVENUECAT_ENTITLEMENT_LOOKUP_KEY in
 * artifacts/api-server/src/routes/billing/index.ts. Reconcile throws -- and so
 * answers 503 -- when no entitlement carries this lookup_key.
 */
const ENTITLEMENT_LOOKUP_KEY = "pass";

const problems: string[] = [];

function fail(problem: string): void {
  problems.push(problem);
  console.log(`  !! ${problem}`);
}

function warn(message: string): void {
  console.log(`  -- ${message}`);
}

/**
 * Renders an SDK failure with its HTTP status and body. The status is the
 * point of this script: 401 means the key is wrong, 403 means the key is
 * missing a permission scope, 404 means the id is wrong.
 */
function detail(error: unknown, response?: Response): string {
  const status = response ? `HTTP ${response.status}` : "";
  const body =
    error === undefined || error === null
      ? ""
      : typeof error === "string"
        ? error
        : JSON.stringify(error);
  return [status, body].filter(Boolean).join(" ") || "(no detail)";
}

async function check(): Promise<void> {
  const client = await getUncachableRevenueCatClient();
  const requestedCustomerId =
    process.argv[2] ?? process.env.REVENUECAT_CHECK_CUSTOMER_ID ?? null;

  // --- Project configuration ------------------------------------------------

  const projectsResult = await listProjects({ client, query: { limit: 20 } });
  if (projectsResult.error) {
    throw new Error(
      `Failed to list projects: ${detail(projectsResult.error, projectsResult.response)}`,
    );
  }
  const project = projectsResult.data.items?.find(
    (p) => p.name === PROJECT_NAME,
  );
  if (!project) {
    console.log(
      "Projects:",
      projectsResult.data.items?.map((p) => `${p.name} (${p.id})`),
    );
    throw new Error(`Project '${PROJECT_NAME}' not found`);
  }
  console.log("Project:", project.name, project.id);

  // The server does not resolve the project by name -- it reads this env var.
  // A credential that works with the wrong project id still 503s on purchase.
  const configuredProjectId = process.env.REVENUECAT_PROJECT_ID;
  if (!configuredProjectId) {
    warn(
      "REVENUECAT_PROJECT_ID is unset here. The API server requires it; set " +
        `it to ${project.id} wherever the server runs.`,
    );
  } else if (configuredProjectId !== project.id) {
    fail(
      `REVENUECAT_PROJECT_ID is ${configuredProjectId}, but '${PROJECT_NAME}' ` +
        `is ${project.id}`,
    );
  }

  const appsResult = await listApps({
    client,
    path: { project_id: project.id },
    query: { limit: 50 },
  });
  console.log("\n=== APPS ===");
  if (appsResult.error) {
    fail(
      `Failed to list apps: ${detail(appsResult.error, appsResult.response)}`,
    );
  } else {
    for (const a of appsResult.data.items) {
      const store =
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (a as any).app_store?.bundle_id ??
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (a as any).play_store?.package_name ??
        "(test store)";
      console.log(`- ${a.type} | id=${a.id} | name=${a.name} | ${store}`);
    }
  }

  const productsResult = await listProducts({
    client,
    path: { project_id: project.id },
    query: { limit: 100 },
  });
  console.log("\n=== PRODUCTS ===");
  if (productsResult.error) {
    fail(
      `Failed to list products: ${detail(productsResult.error, productsResult.response)}`,
    );
  } else {
    for (const p of productsResult.data.items) {
      console.log(
        `- store_id=${p.store_identifier} | type=${p.type} | app_id=${p.app_id} | id=${p.id}`,
      );
    }
  }

  const offeringsResult = await listOfferings({
    client,
    path: { project_id: project.id },
    query: { limit: 20 },
  });
  console.log("\n=== OFFERINGS ===");
  if (offeringsResult.error) {
    fail(
      `Failed to list offerings: ${detail(offeringsResult.error, offeringsResult.response)}`,
    );
  } else {
    for (const o of offeringsResult.data.items) {
      console.log(
        `- lookup_key=${o.lookup_key} | is_current=${o.is_current} | id=${o.id}`,
      );
    }
  }

  // --- The calls /billing/revenuecat/reconcile makes -------------------------

  // 1. Resolve the "pass" lookup_key to an internal entitlement id, because
  //    customer active-entitlement objects only carry that internal id.
  console.log("\n=== ENTITLEMENTS (reconcile step 1) ===");
  let passEntitlementId: string | null = null;
  const entitlementsResult = await listEntitlements({
    client,
    path: { project_id: project.id },
  });
  if (entitlementsResult.error) {
    fail(
      "Failed to list entitlements -- reconcile would 503: " +
        detail(entitlementsResult.error, entitlementsResult.response),
    );
  } else {
    for (const e of entitlementsResult.data.items) {
      console.log(
        `- lookup_key=${e.lookup_key} | state=${e.state} | id=${e.id}`,
      );
    }
    passEntitlementId =
      entitlementsResult.data.items.find(
        (e) => e.lookup_key === ENTITLEMENT_LOOKUP_KEY,
      )?.id ?? null;
    if (passEntitlementId) {
      console.log(
        `  ok: lookup_key "${ENTITLEMENT_LOOKUP_KEY}" -> ${passEntitlementId}`,
      );
    } else {
      fail(
        `No entitlement with lookup_key "${ENTITLEMENT_LOOKUP_KEY}" -- ` +
          "reconcile would 503 on every purchase",
      );
    }
  }

  // 2. Read a customer. Both calls below need customer_information:customers:read,
  //    which is a different permission domain from everything above.
  console.log("\n=== CUSTOMERS (customer_information:customers:read) ===");
  let customerId = requestedCustomerId;
  const customersResult = await listCustomers({
    client,
    path: { project_id: project.id },
    query: { limit: 5 },
  });
  if (customersResult.error) {
    fail(
      "Failed to list customers -- the key is missing Customer information " +
        `read access: ${detail(customersResult.error, customersResult.response)}`,
    );
  } else {
    for (const c of customersResult.data.items) {
      console.log(
        `- id=${c.id} | first_seen=${new Date(c.first_seen_at).toISOString()}`,
      );
    }
    if (!customerId) {
      customerId = customersResult.data.items[0]?.id ?? null;
    }
  }

  // 3. The call that decides whether a purchase grants the pass.
  console.log("\n=== ACTIVE ENTITLEMENTS (reconcile step 2) ===");
  if (!customerId) {
    warn(
      "No customer to check. The project reports none, so this call could " +
        "not be exercised; pass a customer id as an argument once one exists.",
    );
  } else {
    console.log(`Customer: ${customerId}`);
    const activeResult = await listCustomerActiveEntitlements({
      client,
      path: { project_id: project.id, customer_id: customerId },
    });
    if (activeResult.error) {
      fail(
        "Failed to fetch active entitlements -- reconcile would 503: " +
          detail(activeResult.error, activeResult.response),
      );
    } else {
      for (const e of activeResult.data.items) {
        const expires =
          e.expires_at === null
            ? "never"
            : new Date(e.expires_at).toISOString();
        console.log(
          `- entitlement_id=${e.entitlement_id} | expires=${expires}`,
        );
      }
      if (activeResult.data.items.length === 0) {
        console.log(
          "  (none -- the call succeeded, this customer has no pass)",
        );
      }
      if (passEntitlementId) {
        const hasPass = activeResult.data.items.some(
          (e) => e.entitlement_id === passEntitlementId,
        );
        console.log(
          `  reconcile verdict for this customer: ${hasPass ? "grant pass" : "no pass"}`,
        );
      }
    }
  }

  console.log("\n=== SUMMARY ===");
  if (problems.length === 0) {
    console.log(
      "OK -- this credential can make every RevenueCat call the API server makes.",
    );
    return;
  }
  console.log(`${problems.length} problem(s):`);
  for (const p of problems) {
    console.log(`- ${p}`);
  }
  process.exitCode = 1;
}

check().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
