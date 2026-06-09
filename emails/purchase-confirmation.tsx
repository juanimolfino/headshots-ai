import * as React from "react";

export function PurchaseConfirmationEmail({ credits }: { credits: { blue: number; gold: number } }) {
  const parts = [
    credits.blue > 0 ? `${credits.blue} blue credits` : null,
    credits.gold > 0 ? `${credits.gold} gold credits` : null
  ].filter(Boolean);

  return (
    <html>
      <body>
        <h1>Credits added</h1>
        <p>{parts.join(" and ")} were added to your account.</p>
      </body>
    </html>
  );
}
