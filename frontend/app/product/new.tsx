import React from "react";
import { useLocalSearchParams } from "expo-router";
import { api } from "@/src/api";
import { ProductEditor } from "@/src/components/ProductEditor";

export default function NewProduct() {
  const params = useLocalSearchParams<{ barcode?: string; name?: string; brand?: string; image?: string }>();
  const today = new Date().toISOString().slice(0, 10);
  return (
    <ProductEditor
      title="New Product"
      initial={{
        barcode: params.barcode || "",
        name: params.name || "",
        brand: params.brand || "",
        image: params.image || "",
        purchase_date: today,
      }}
      onSave={async (body) => { await api("/products", { method: "POST", body }); }}
    />
  );
}
