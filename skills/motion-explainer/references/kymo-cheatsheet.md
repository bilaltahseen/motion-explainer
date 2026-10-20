# Kymo `.kymo` cheatsheet (the subset motion-explainer uses)

Kymo is a line-oriented diagram language. It handles layout, edge routing and canvas size for you. The full grammar lives at https://github.com/kymostudio/kymostudio/tree/main/docs/formats/kymo-dsl. Everything below has been checked against the render API (`kymostudio` JS engine 0.4.x).

## Minimal file

```kymo
title: "Order processing"

web     box/programming-react/blue        "Checkout UI"   "React"
api     box/programming-javascript/green  "Orders API"    "Node.js"
db      cylinder/onprem-postgresql/blue   "orders"        "Postgres"
kafka   box/onprem-kafka/orange           "orders topic"  "Kafka"

layout { web | api | { db , kafka } }

web --> api   : "POST /orders"
api --> db    : "INSERT"
api --> kafka
```

## Nodes (leaves)

```
<id>  <shape>/<icon>/<accent>  "<Label>"  "<Subtitle>"  [@ <placement>]
```

- **id**: `[A-Za-z_][A-Za-z0-9_-]*`. This is the id you use in `explainer.json`. Don't use reserved words such as `start`, `end`, `top`, `left`, `layout` or `row`.
- **shape**: `box`, `circle`, `hex`, `cylinder`, `cube`, `cube-big`, `badge`. With a brand icon the glyph replaces the shape, so the shape barely matters. Use `cylinder` for stores out of habit.
- **icon**: see "Icons" below.
- **accent**: `blue`, `green`, `orange`, `red`. It's required syntax, but the current JS renderer mostly ignores it (`box` is always orange, `hex` always green). Don't use colour to carry meaning.
- **Label** is required and shown under the node. **Subtitle** may be `""`. Kymo's JS renderer drops subtitles, but the player draws them back in.
- Each label must be unique. The tagger matches SVG nodes to ids by label first.

## Placement: prefer the one-line layout tree

```kymo
layout { a | b | { c , d } | e }
```

`|` puts items left to right and `,` stacks them top to bottom. Braces nest. You can't mix `|` and `,` at the same level: write `a | { b , c }`, never `a | b , c`. Each id appears once, and it draws no box.

Alternatives:
- `@ other right 120` (also `left`, `top`, `bottom`) places a node relative to another.
- `@ (x, y)` gives absolute coordinates. Avoid this.

## Groups (regions)

```kymo
backend outer "Backend" {
  api  box/programming-go/green       "API"    ""
  db   cylinder/onprem-postgresql/blue "DB"    ""
}
```

`outer` draws a solid outline and `inner` a dashed violet one. Add `horizontal` or `vertical` after the label to auto-layout its members, which must then be bare ids defined elsewhere. Use regions sparingly; they're for trust boundaries and deployment units.

## Edges

```
<src> --> <dst> [: "label"]     # gray
<src> ==> <dst> [: "label"]     # highlighted
```

- Edges must connect **nodes**. Edges to a region id are silently dropped by the JS renderer, so connect to a node inside it.
- Declare one edge per direction that a flow uses. A request/response pair is `a --> b` plus `b --> a`. The tagger moves the two onto separate lanes.
- Keep edge labels to 1–2 words, or leave them out. Detail belongs in the step's `packet.label`. Labels between close columns overlap.
- Anchor options (`{ src=right(0,-10) … }`) are ignored by the JS renderer, so don't use them.

## Icons

- `grep -i redis references/icons.txt` lists the names. Use the bare name, e.g. `onprem-redis`.
- **Built-in glyphs** (always work, including offline): `user`, `gear`, `files`, `folder`, `checklist`, `magnifier`, `send`, `zap`, `key`, `cloud`, `internet-cloud`, `notebook`, `archive`, `boxes`, `hex-agent`, `neural`, `cylinder`, `site-globe`, `slack`, `plus`, `aws-lambda`, `aws-s3`, `aws-dynamodb`.
- **Brand icons verified to render**: `programming-react`, `programming-javascript`, `programming-python`, `programming-go`, `programming-nextjs`, `onprem-postgresql`, `onprem-mongodb`, `onprem-redis`, `onprem-kafka`, `onprem-rabbitmq`, `onprem-celery`, `onprem-nginx`, `onprem-grafana`, `saas-stripe`, `saas-auth0`, `saas-okta`, `saas-twilio`, `aws-lambda-function`, `aws-api-gateway`, `aws-simple-queue-service-sqs`.
- **Known missing on Kymo's CDN** (the API returns 400): `programming-nodejs`, `programming-typescript`, `onprem-docker`, `onprem-prometheus`. Others may be missing too. When the build says `icon fetch failed`, swap the icon and rebuild.
- Offline (`npx kymostudio`), only built-in glyphs work.

## Avoid

- Named layout containers (`row horizontal pos (…) gap … { … }`), which draw stray boxes. Use `layout { … }` instead.
- `bpmn { }` and `flowchart { }` blocks. They render, but their nodes can't be animated.
- More than about 12 nodes. Split the explainer instead.
