export type ContactField = 'name' | 'email' | 'phone';
type Contact = Record<ContactField, string>;
export type CheckoutContact = {
  identity: string | null;
  values: Contact;
  edited: Record<ContactField, boolean>;
};
export type ContactAction =
  | { type: 'identity'; identity: string | null }
  | { type: 'edit'; field: ContactField; value: string }
  | { type: 'profile'; identity: string; profile: Record<ContactField, string | null> };

export const emptyCheckoutContact: CheckoutContact = {
  identity: null,
  values: { name: '', email: '', phone: '' },
  edited: { name: false, email: false, phone: false },
};

export function checkoutContactReducer(state: CheckoutContact, action: ContactAction): CheckoutContact {
  if (action.type === 'edit') {
    return {
      ...state,
      values: { ...state.values, [action.field]: action.value },
      edited: { ...state.edited, [action.field]: true },
    };
  }
  if (action.type === 'identity') {
    if (state.identity === action.identity) return state;
    return {
      ...state,
      identity: action.identity,
      values: {
        name: state.edited.name ? state.values.name : '',
        email: state.edited.email ? state.values.email : '',
        phone: state.edited.phone ? state.values.phone : '',
      },
    };
  }
  if (state.identity !== action.identity) return state;
  return {
    ...state,
    values: {
      name: state.edited.name ? state.values.name : (action.profile.name || ''),
      email: state.edited.email ? state.values.email : (action.profile.email || ''),
      phone: state.edited.phone ? state.values.phone : (action.profile.phone || ''),
    },
  };
}
