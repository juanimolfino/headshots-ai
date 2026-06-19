import * as React from "react";

export function JobFailedEmail({
  heading,
  body,
  refund,
  actionUrl,
  actionLabel = "Try again"
}: {
  heading: string;
  body: string;
  refund: string;
  actionUrl: string;
  actionLabel?: string;
}) {
  return (
    <html>
      <body>
        <h1>{heading}</h1>
        <p>{body}</p>
        <p>{refund}</p>
        <p>
          <a href={actionUrl}>{actionLabel}</a>
        </p>
      </body>
    </html>
  );
}
