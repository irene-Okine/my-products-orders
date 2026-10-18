const express = require("express");
const db = require("./db");

const app = express();
app.use(express.json());

// ---------- helpers ----------
const isNonEmptyString = (v) => typeof v === "string" && v.trim().length > 0;
const isNonNegativeNumber = (v) => typeof v === "number" && Number.isFinite(v) && v >= 0;
const isNonNegativeInt = (v) => Number.isInteger(v) && v >= 0;
const isPositiveInt = (v) => Number.isInteger(v) && v > 0;

function validateProduct(body, { partial = false } = {}) {
  const errors = [];
  const { name, price, stock } = body;
  if (!partial || name !== undefined) {
    if (!isNonEmptyString(name)) errors.push("name must be a non-empty string");
  }
  if (!partial || price !== undefined) {
    if (!isNonNegativeNumber(price)) errors.push("price must be a number >= 0");
  }
  if (stock !== undefined && !isNonNegativeInt(stock)) {
    errors.push("stock must be an integer >= 0");
  }
  return errors;
}

// ---------- home ----------
// Friendly message for anyone who opens the base URL in a browser
app.get("/", (req, res) => {
  res.json({
    message: "Products and Orders API is running",
    try: ["GET /products", "GET /orders"],
  });
});

// ---------- products ----------
// Create a product
app.post("/products", (req, res) => {
  const errors = validateProduct(req.body);
  if (errors.length) return res.status(400).json({ errors });

  const { name, price, stock = 0 } = req.body;
  const result = db
    .prepare("INSERT INTO products (name, price, stock) VALUES (?, ?, ?)")
    .run(name.trim(), price, stock);
  const product = db.prepare("SELECT * FROM products WHERE id = ?").get(result.lastInsertRowid);
  res.status(201).json(product);
});

// List all products
app.get("/products", (req, res) => {
  res.json(db.prepare("SELECT * FROM products ORDER BY id").all());
});

// Get one product
app.get("/products/:id", (req, res) => {
  const product = db.prepare("SELECT * FROM products WHERE id = ?").get(req.params.id);
  if (!product) return res.status(404).json({ error: "Product not found" });
  res.json(product);
});

// Update a product (send only the fields you want to change)
app.put("/products/:id", (req, res) => {
  const existing = db.prepare("SELECT * FROM products WHERE id = ?").get(req.params.id);
  if (!existing) return res.status(404).json({ error: "Product not found" });

  const errors = validateProduct(req.body, { partial: true });
  if (errors.length) return res.status(400).json({ errors });

  const name = req.body.name !== undefined ? req.body.name.trim() : existing.name;
  const price = req.body.price !== undefined ? req.body.price : existing.price;
  const stock = req.body.stock !== undefined ? req.body.stock : existing.stock;

  db.prepare("UPDATE products SET name = ?, price = ?, stock = ? WHERE id = ?")
    .run(name, price, stock, existing.id);
  res.json(db.prepare("SELECT * FROM products WHERE id = ?").get(existing.id));
});

// Delete a product (not allowed if it already appears in an order)
app.delete("/products/:id", (req, res) => {
  const existing = db.prepare("SELECT id FROM products WHERE id = ?").get(req.params.id);
  if (!existing) return res.status(404).json({ error: "Product not found" });

  const used = db.prepare("SELECT 1 FROM order_items WHERE product_id = ? LIMIT 1").get(existing.id);
  if (used) {
    return res.status(409).json({ error: "Product is part of an existing order and cannot be deleted" });
  }
  db.prepare("DELETE FROM products WHERE id = ?").run(existing.id);
  res.status(204).send();
});

// ---------- orders ----------
function getOrder(id) {
  const order = db.prepare("SELECT * FROM orders WHERE id = ?").get(id);
  if (!order) return null;
  order.items = db
    .prepare(
      `SELECT oi.product_id, p.name, oi.quantity, oi.unit_price
       FROM order_items oi JOIN products p ON p.id = oi.product_id
       WHERE oi.order_id = ?`
    )
    .all(id);
  return order;
}

// Place an order: { "items": [ { "productId": 1, "quantity": 2 } ] }
// Runs inside a transaction so stock and order records stay consistent:
// if anything fails, ROLLBACK undoes every change made so far.
function placeOrder(items) {
  db.exec("BEGIN");
  try {
    let total = 0;
    const lines = [];

    for (const item of items) {
      const product = db.prepare("SELECT * FROM products WHERE id = ?").get(item.productId);
      if (!product) {
        const err = new Error(`Product ${item.productId} not found`);
        err.status = 404;
        throw err;
      }
      if (product.stock < item.quantity) {
        const err = new Error(`Not enough stock for "${product.name}" (available: ${product.stock})`);
        err.status = 409;
        throw err;
      }
      total += product.price * item.quantity;
      lines.push({ product, quantity: item.quantity });
    }

    const orderId = db
      .prepare("INSERT INTO orders (total) VALUES (?)")
      .run(Math.round(total * 100) / 100).lastInsertRowid;
    for (const { product, quantity } of lines) {
      db.prepare("INSERT INTO order_items (order_id, product_id, quantity, unit_price) VALUES (?, ?, ?, ?)")
        .run(orderId, product.id, quantity, product.price);
      db.prepare("UPDATE products SET stock = stock - ? WHERE id = ?").run(quantity, product.id);
    }

    db.exec("COMMIT");
    return orderId;
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

app.post("/orders", (req, res) => {
  const { items } = req.body;
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ errors: ["items must be a non-empty array"] });
  }
  const errors = [];
  items.forEach((it, i) => {
    if (!isPositiveInt(it.productId)) errors.push(`items[${i}].productId must be a positive integer`);
    if (!isPositiveInt(it.quantity)) errors.push(`items[${i}].quantity must be a positive integer`);
  });
  if (errors.length) return res.status(400).json({ errors });

  try {
    const orderId = placeOrder(items);
    res.status(201).json(getOrder(orderId));
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

app.get("/orders", (req, res) => {
  const ids = db.prepare("SELECT id FROM orders ORDER BY id").all();
  res.json(ids.map(({ id }) => getOrder(id)));
});

app.get("/orders/:id", (req, res) => {
  const order = getOrder(req.params.id);
  if (!order) return res.status(404).json({ error: "Order not found" });
  res.json(order);
});

// ---------- fallbacks ----------
app.use((req, res) => res.status(404).json({ error: "Route not found" }));
app.use((err, req, res, next) => {
  // Malformed JSON bodies end up here
  if (err.type === "entity.parse.failed") return res.status(400).json({ error: "Invalid JSON" });
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

module.exports = app;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`API running on http://localhost:${PORT}`));
}
