const res = await fetch(process.env.FAMILY_OS_API_URL, {
  method: "POST",
  redirect: "follow",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    api_key: process.env.FAMILY_OS_API_KEY,
    action: "get_low_stock_items",
    payload: {},
    request_text: "",
    actor_id: "diag",
  }),
});

const text = await res.text();
console.log(JSON.stringify({
  status: res.status,
  url: res.url,
  body_preview: text.slice(0, 500),
}, null, 2));
