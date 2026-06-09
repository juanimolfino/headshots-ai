import * as React from "react";

export function WelcomeEmail({ credits }: { credits: { blue: number; gold: number } }) {
  return (
    <html>
      <body>
        <h1>Welcome</h1>
        <p>
          Your account is ready and includes {credits.blue} blue credits
          {credits.gold > 0 ? ` and ${credits.gold} gold credits` : ""}.
        </p>
      </body>
    </html>
  );
}
