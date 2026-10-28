import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
const api = `data:text/javascript;base64,${Buffer.from('export const formatPrice = cents => new Intl.NumberFormat("en-US", {style:"currency",currency:"USD"}).format(cents/100)').toString("base64")}`;
const source = ts
  .transpileModule(readFileSync(new URL("../src/components/CatalogPrice.tsx", import.meta.url), "utf8"), {
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext },
  })
  .outputText.replace(
    /from ['"]([^'"]+)['"]/g,
    (_, name) => `from ${JSON.stringify(name === "../services/api" ? api : import.meta.resolve(name))}`
  );
const { default: CatalogPrice } = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
const pricing = {
  unit_price_cents: 1295,
  compare_at_price_cents: null,
  purchasable: true,
  reason: null,
  price_varies: false,
  location_id: null,
};
const render = (changes = {}, compact = false, productType = "single") =>
  renderToStaticMarkup(createElement(CatalogPrice, { pricing: { ...pricing, ...changes }, compact, productType }));
test("card eligibility is concise while details retain server reasons and never invent a zero price", () => {
  for (const compact of [false, true])
    for (const changes of [
      { purchasable: false, reason: "This item now requires a catering inquiry" },
      { unit_price_cents: null, reason: "A quote is required" },
      { purchasable: false, unit_price_cents: 0, reason: "Contact us for a price before ordering" },
    ]) {
      const html = render(changes, compact);
      assert.doesNotMatch(html, /\$0/);
      assert.match(
        html,
        new RegExp(
          compact ? (changes.reason.includes("catering") ? "Catering inquiry" : "Price by request") : changes.reason
        )
      );
    }
  const missing = renderToStaticMarkup(createElement(CatalogPrice, { productType: "single", compact: true }));
  assert.match(missing, /Price by request/);
  assert.doesNotMatch(missing, /\$/);
});
test("sale, varying, explicitly free and complimentary prices retain server pricing semantics", () => {
  for (const compact of [false, true]) {
    const sale = render({ unit_price_cents: 1195, compare_at_price_cents: 1495, price_varies: true }, compact);
    assert.match(sale, /From \$11.95/);
    assert.match(sale, /Was /);
    assert.match(sale, /\$14.95/);
    assert.match(render({ unit_price_cents: 0 }, compact), /\$0.00/);
    assert.match(
      render({ unit_price_cents: 0 }, compact, "complimentary_with_meal"),
      compact ? /With a meal/ : /Complimentary with a meal/
    );
  }
});
