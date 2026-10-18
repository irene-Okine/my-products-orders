// Small wrapper around fetch for talking to the REST API.
async function request(path, options = {}) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (res.status === 204) return null;

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.error || data?.errors?.join(", ") || "Something went wrong");
  }
  return data;
}

export const api = {
  listProducts: () => request("/products"),
  createProduct: (p) => request("/products", { method: "POST", body: JSON.stringify(p) }),
  updateProduct: (id, p) => request(`/products/${id}`, { method: "PUT", body: JSON.stringify(p) }),
  deleteProduct: (id) => request(`/products/${id}`, { method: "DELETE" }),
  listOrders: () => request("/orders"),
  createOrder: (items) => request("/orders", { method: "POST", body: JSON.stringify({ items }) }),
};
