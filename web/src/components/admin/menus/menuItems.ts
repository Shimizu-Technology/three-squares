export interface MenuProduct {
  id: number;
  name: string;
  published: boolean;
  archived: boolean;
  base_price_cents: number;
}

export function moveMenuItem(ids: number[], id: number, offset: number) {
  const index = ids.indexOf(id), next = index + offset;
  if (index < 0 || next < 0 || next >= ids.length) return ids;
  const result = [...ids];
  [result[index], result[next]] = [result[next], result[index]];
  return result;
}

export function menuProductPrice(product: MenuProduct) {
  return product.base_price_cents > 0
    ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(product.base_price_cents / 100)
    : 'Price requires setup';
}

