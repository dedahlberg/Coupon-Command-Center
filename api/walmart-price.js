// Vercel serverless function: official Walmart Marketplace catalog adapter.
// This uses Walmart Marketplace OAuth credentials if configured.
// It is NOT a local-store shelf-price scraper.
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  const q = String(req.query.q || "").trim();
  const upc = String(req.query.upc || "").trim();

  if (!q && !upc) {
    return res.status(400).json({ok:false,error:"Provide q or upc."});
  }

  const clientId = process.env.WALMART_CLIENT_ID;
  const clientSecret = process.env.WALMART_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return res.status(200).json({
      ok:false,
      configured:false,
      mode:"walmart-link-out",
      message:"Official Walmart Marketplace credentials are not configured.",
      walmartUrl:`https://www.walmart.com/search?q=${encodeURIComponent(q || upc)}`
    });
  }

  try {
    const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
    const tokenResponse = await fetch("https://marketplace.walmartapis.com/v3/token", {
      method:"POST",
      headers:{
        "Authorization":`Basic ${basic}`,
        "Accept":"application/json",
        "Content-Type":"application/x-www-form-urlencoded"
      },
      body:"grant_type=client_credentials"
    });

    const tokenJson = await tokenResponse.json();
    if (!tokenResponse.ok || !tokenJson.access_token) {
      return res.status(502).json({ok:false,configured:true,error:"Walmart token request failed.",details:tokenJson});
    }

    const params = new URLSearchParams();
    if (upc) params.set("upc", upc); else params.set("query", q);

    const correlationId = crypto.randomUUID();
    const itemResponse = await fetch(`https://marketplace.walmartapis.com/v3/items/walmart/search?${params}`, {
      headers:{
        "WM_SEC.ACCESS_TOKEN":tokenJson.access_token,
        "WM_QOS.CORRELATION_ID":correlationId,
        "WM_SVC.NAME":"Walmart Marketplace",
        "Accept":"application/json"
      }
    });
    const data = await itemResponse.json();

    return res.status(itemResponse.ok ? 200 : 502).json({
      ok:itemResponse.ok,
      configured:true,
      source:"Walmart Marketplace API",
      note:"This is authenticated Walmart Marketplace catalog data. It should not be treated as a local-store shelf price unless the returned data explicitly supports that use.",
      query:q || null,
      upc:upc || null,
      data
    });
  } catch (e) {
    return res.status(500).json({ok:false,configured:true,error:String(e)});
  }
}
