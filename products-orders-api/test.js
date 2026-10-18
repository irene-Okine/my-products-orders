// Simple end-to-end test using Node's built-in test runner (no extra packages).
process.env.DB_FILE = ":memory:";
const test = require("node:test");
const assert = require("node:assert");
const app = require("./server");

let server, base;
test.before(() => new Promise((resolve) => {
  server = app.listen(0, () => { base = `http://localhost:${server.address().port}`; resolve(); });
}));
test.after(() => server.close());

const call = async (method, path, body) => {
  const res = await fetch(base + path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, data: text ? JSON.parse(text) : null };
};

test("products CRUD", async () => {
  let r = await call("POST", "/products", { name: "Notebook", price: 12.5, stock: 10 });
  assert.strictEqual(r.status, 201);
  const id = r.data.id;

  r = await call("POST", "/products", { name: "", price: -1 });
  assert.strictEqual(r.status, 400);

  r = await call("PUT", `/products/${id}`, { price: 15 });
  assert.strictEqual(r.data.price, 15);

  r = await call("GET", `/products/${id}`);
  assert.strictEqual(r.data.name, "Notebook");

  r = await call("GET", "/products/9999");
  assert.strictEqual(r.status, 404);
});

test("orders reduce stock and calculate totals", async () => {
  const p = (await call("POST", "/products", { name: "Pen", price: 2, stock: 5 })).data;

  let r = await call("POST", "/orders", { items: [{ productId: p.id, quantity: 3 }] });
  assert.strictEqual(r.status, 201);
  assert.strictEqual(r.data.total, 6);

  r = await call("GET", `/products/${p.id}`);
  assert.strictEqual(r.data.stock, 2);

  r = await call("POST", "/orders", { items: [{ productId: p.id, quantity: 5 }] });
  assert.strictEqual(r.status, 409); // not enough stock

  r = await call("DELETE", `/products/${p.id}`);
  assert.strictEqual(r.status, 409); // used in an order
});
