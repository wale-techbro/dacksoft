# Business connectors

`BusinessConnector` defines a stable id, demo/external kind, explicit capabilities, connection test, and customer/order reads. `nexastoreDemoConnector` is registered as a **demo connector** and resolves only synthetic fixture data. It does not call an external retailer.

Add future Shopify, WooCommerce, REST, CRM, messaging, or ticketing connectors behind this interface after reviewing their official APIs, auth scopes, rate limits, and data handling requirements. Store credential references rather than provider secrets in integration rows. Extend capabilities deliberately and make each tool require the relevant capability.
