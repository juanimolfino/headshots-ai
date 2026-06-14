import * as React from "react";

export function JobReadyEmail({
  heading,
  body,
  actionUrl,
  actionLabel = "Open dashboard"
}: {
  heading: string;
  body: string;
  actionUrl: string;
  actionLabel?: string;
}) {
  return (
    <html>
      <body>
        <h1>{heading}</h1>
        <p>{body}</p>
        <p>
          <a href={actionUrl}>{actionLabel}</a>
        </p>
      </body>
    </html>
  );
}
