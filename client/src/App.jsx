import { useEffect, useState } from "react";
import { api } from "./api.js";

const money = (n) => `GH₵ ${Number(n).toFixed(2)}`;
const emptyForm = { name: "", price: "", stock: "" };

export default function App() {
  const [tab, setTab] = useState("products");
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [notice, setNotice] = useState(null); // { type: "error" | "success", text }

  const show = (type, text) => setNotice({ type, text });

  async function refresh() {
    try {
      const [p, o] = await Promise.all([api.listProducts(), api.listOrders()]);
      setProducts(p);
      setOrders(o.reverse()); // newest first
    } catch {
      show("error", "Cannot reach the API. Is the server running on port 3000?");
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  return (
    <div className="app">
      <h1>Products and Orders</h1>

      <nav className="tabs">
        {["products", "orders"].map((t) => (
          <button
            key={t}
            className={tab === t ? "tab active" : "tab"}
            onClick={() => { setTab(t); setNotice(null); }}
          >
            {t === "products" ? "Products" : "Orders"}
          </button>
        ))}
      </nav>

      {notice && <p className={`notice ${notice.type}`}>{notice.text}</p>}

      {tab === "products" ? (
        <Products products={products} refresh={refresh} show={show} />
      ) : (
        <Orders products={products} orders={orders} refresh={refresh} show={show} />
      )}
    </div>
  );
}

function Products({ products, refresh, show }) {
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);

  const change = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    const payload = {
      name: form.name,
      price: Number(form.price),
      stock: form.stock === "" ? 0 : Number(form.stock),
    };
    try {
      if (editingId) {
        await api.updateProduct(editingId, payload);
        show("success", "Product updated");
      } else {
        await api.createProduct(payload);
        show("success", "Product added");
      }
      setForm(emptyForm);
      setEditingId(null);
      refresh();
    } catch (err) {
      show("error", err.message);
    }
  }

  function startEdit(p) {
    setEditingId(p.id);
    setForm({ name: p.name, price: String(p.price), stock: String(p.stock) });
  }

  async function remove(p) {
    if (!window.confirm(`Delete "${p.name}"?`)) return;
    try {
      await api.deleteProduct(p.id);
      show("success", "Product deleted");
      refresh();
    } catch (err) {
      show("error", err.message);
    }
  }

  return (
    <section>
      <form className="form" onSubmit={submit}>
        <input name="name" placeholder="Product name" value={form.name} onChange={change} required />
        <input name="price" type="number" step="0.01" min="0" placeholder="Price" value={form.price} onChange={change} required />
        <input name="stock" type="number" min="0" step="1" placeholder="Stock" value={form.stock} onChange={change} />
        <button type="submit" className="primary">{editingId ? "Save changes" : "Add product"}</button>
        {editingId && (
          <button type="button" onClick={() => { setEditingId(null); setForm(emptyForm); }}>
            Cancel
          </button>
        )}
      </form>

      {products.length === 0 ? (
        <p className="empty">No products yet. Add your first one above.</p>
      ) : (
        <table>
          <thead>
            <tr><th>Name</th><th>Price</th><th>Stock</th><th></th></tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id}>
                <td>{p.name}</td>
                <td>{money(p.price)}</td>
                <td className={p.stock === 0 ? "out" : ""}>{p.stock === 0 ? "Out of stock" : p.stock}</td>
                <td className="actions">
                  <button onClick={() => startEdit(p)}>Edit</button>
                  <button className="danger" onClick={() => remove(p)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function Orders({ products, orders, refresh, show }) {
  const [quantities, setQuantities] = useState({}); // { productId: quantity }

  const available = products.filter((p) => p.stock > 0);
  const items = Object.entries(quantities)
    .filter(([, q]) => q > 0)
    .map(([id, q]) => ({ productId: Number(id), quantity: q }));
  const total = items.reduce((sum, it) => {
    const p = products.find((x) => x.id === it.productId);
    return sum + (p ? p.price * it.quantity : 0);
  }, 0);

  function setQty(id, value) {
    setQuantities({ ...quantities, [id]: Math.max(0, parseInt(value, 10) || 0) });
  }

  async function place() {
    try {
      const order = await api.createOrder(items);
      show("success", `Order #${order.id} placed for ${money(order.total)}`);
      setQuantities({});
      refresh();
    } catch (err) {
      show("error", err.message);
    }
  }

  return (
    <section>
      <h2>New order</h2>
      {available.length === 0 ? (
        <p className="empty">No products in stock. Add products first.</p>
      ) : (
        <>
          <table>
            <thead>
              <tr><th>Product</th><th>Price</th><th>In stock</th><th>Quantity</th></tr>
            </thead>
            <tbody>
              {available.map((p) => (
                <tr key={p.id}>
                  <td>{p.name}</td>
                  <td>{money(p.price)}</td>
                  <td>{p.stock}</td>
                  <td>
                    <input
                      className="qty"
                      type="number"
                      min="0"
                      max={p.stock}
                      value={quantities[p.id] || 0}
                      onChange={(e) => setQty(p.id, e.target.value)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="order-bar">
            <strong>Total: {money(total)}</strong>
            <button className="primary" disabled={items.length === 0} onClick={place}>
              Place order
            </button>
          </div>
        </>
      )}

      <h2>Order history</h2>
      {orders.length === 0 ? (
        <p className="empty">No orders yet.</p>
      ) : (
        orders.map((o) => (
          <div className="order" key={o.id}>
            <div className="order-head">
              <strong>Order #{o.id}</strong>
              <span>{o.created_at}</span>
              <strong>{money(o.total)}</strong>
            </div>
            <ul>
              {o.items.map((it) => (
                <li key={it.product_id}>
                  {it.quantity} × {it.name} @ {money(it.unit_price)}
                </li>
              ))}
            </ul>
          </div>
        ))
      )}
    </section>
  );
}
