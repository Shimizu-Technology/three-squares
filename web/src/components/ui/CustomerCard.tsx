import type { ReactNode } from "react";
import { Link, type LinkProps } from "react-router-dom";

/** Whole-card navigation; children must not contain interactive controls. */
export function CustomerCard({
  to,
  children,
  kind = "product",
}: {
  to: LinkProps["to"];
  children: ReactNode;
  kind?: "product" | "collection";
}) {
  return (
    <Link to={to} className={`customer-card customer-card--${kind}`} data-customer-card={kind}>
      {children}
    </Link>
  );
}

/** Display cards contain their own named links/actions rather than one outer link. */
export function CustomerCardFrame({ children }: { children: ReactNode }) {
  return <article className="customer-card customer-card--location" data-customer-card="location">{children}</article>;
}
