type ProductLike = {
  allow_pickup?: boolean;
  allow_shipping?: boolean;
  available_location_ids?: number[];
};

type CartItemLike = {
  product: ProductLike;
};

export type CartCompatibility = {
  hasConflict: boolean;
  reason: 'fulfillment' | 'pickup_location' | null;
  message: string | null;
  relevantPickupLocationIds: number[];
};

const constrainedPickupLocationIds = (product: ProductLike): number[] =>
  (product.available_location_ids || []).filter((id): id is number => Number.isInteger(id));

export function evaluateCartCompatibility(
  cartItems: CartItemLike[],
  candidateProduct: ProductLike
): CartCompatibility {
  if (cartItems.length === 0) {
    return { hasConflict: false, reason: null, message: null, relevantPickupLocationIds: [] };
  }

  const cartHasShippableItems = cartItems.some((item) => item.product.allow_shipping === true);
  const cartHasPickupOnlyItems = cartItems.some((item) => item.product.allow_shipping !== true);
  const candidateIsShippable = candidateProduct.allow_shipping === true;

  const hasFulfillmentConflict =
    (cartHasShippableItems && !candidateIsShippable) ||
    (cartHasPickupOnlyItems && candidateIsShippable);

  if (hasFulfillmentConflict) {
    return {
      hasConflict: true,
      reason: 'fulfillment',
      message: candidateIsShippable
        ? 'Your cart has pickup-only items. Clear cart to add shippable items.'
        : 'Your cart has shippable items. Clear cart to add pickup-only items.',
      relevantPickupLocationIds: [],
    };
  }

  // Location conflict only applies to pickup-only combinations.
  const products = [...cartItems.map((item) => item.product), candidateProduct];
  const pickupOnlyProducts = products.filter(
    (product) => product.allow_pickup === true && product.allow_shipping !== true
  );

  if (pickupOnlyProducts.length !== products.length) {
    return { hasConflict: false, reason: null, message: null, relevantPickupLocationIds: [] };
  }

  const constrainedSets = pickupOnlyProducts
    .map((product) => constrainedPickupLocationIds(product))
    .filter((ids) => ids.length > 0);

  if (constrainedSets.length === 0) {
    return { hasConflict: false, reason: null, message: null, relevantPickupLocationIds: [] };
  }

  const sharedPickupLocationIds = constrainedSets.reduce((intersection, ids) =>
    intersection.filter((id) => ids.includes(id))
  );

  if (sharedPickupLocationIds.length === 0) {
    const candidatePickupLocationIds = constrainedPickupLocationIds(candidateProduct);
    return {
      hasConflict: true,
      reason: 'pickup_location',
      message: 'Pickup location does not match items already in your cart.',
      relevantPickupLocationIds: candidatePickupLocationIds,
    };
  }

  return {
    hasConflict: false,
    reason: null,
    message: null,
    relevantPickupLocationIds: sharedPickupLocationIds,
  };
}
