import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { LOGO_DATA_URI } from "@/src/logoBase64";

type Labels = {
  title: string; number: string; warehouse: string; date: string; status: string;
  productName: string; articleNo: string; ean: string; system: string; counted: string; diff: string;
};

export async function buildStocktakePdf(st: any, company: any, L: Labels) {
  const comp = company || {};
  const compBlock = comp.company_name
    ? `<div style="font-size:16px;font-weight:700">${comp.company_name}</div><div class="sub">${[comp.street1, comp.street2, comp.postcode, comp.city, comp.state, comp.county].filter(Boolean).join(", ")}</div>`
    : "";
  const rows = (st.items || []).map((it: any, idx: number) => {
    const d = Number(it.counted_qty || 0) - Number(it.system_qty || 0);
    const dTxt = d > 0 ? `+${d}` : String(d);
    const dColor = d === 0 ? "#111" : d > 0 ? "#2E7D32" : "#C62828";
    return `<tr><td>${idx + 1}</td><td>${it.name || "-"}</td><td>${it.sku || "-"}</td><td>${it.barcode || "-"}</td>
      <td style="text-align:right">${it.system_qty}</td><td style="text-align:right;font-weight:700">${it.counted_qty}</td>
      <td style="text-align:right;color:${dColor};font-weight:700">${dTxt}</td></tr>`;
  }).join("");
  const html = `<html><head><meta name="viewport" content="width=device-width, initial-scale=1"/>
    <style>body{font-family:-apple-system,Helvetica,Arial;padding:24px;color:#111}h1{color:#E64A19;margin-bottom:0}
    .sub{color:#555;margin-top:3px;font-size:13px}table{width:100%;border-collapse:collapse;margin-top:16px;font-size:12px}
    th,td{border-bottom:1px solid #ddd;padding:7px;text-align:left}th{background:#f4f4f4}</style></head><body>
    <h1>${L.title}</h1>
    <div class="sub" style="font-size:16px;color:#111;font-weight:700">${st.number || ""}</div>
    ${compBlock}
    <div class="sub">${L.warehouse}: ${st.warehouse_name || "-"}</div>
    <div class="sub">${L.date}: ${st.date || "-"}</div>
    <div class="sub">${L.status}: ${st.status || "-"}</div>
    <table><tr><th>#</th><th>${L.productName}</th><th>${L.articleNo}</th><th>${L.ean}</th>
      <th style="text-align:right">${L.system}</th><th style="text-align:right">${L.counted}</th><th style="text-align:right">${L.diff}</th></tr>${rows}</table>
    <div style="text-align:center;margin-top:40px;border-top:1px solid #eee;padding-top:14px"><img src="${LOGO_DATA_URI}" style="height:54px"/></div>
    </body></html>`;
  try {
    const { uri } = await Print.printToFileAsync({ html });
    if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: "application/pdf", dialogTitle: L.title });
  } catch {}
}
