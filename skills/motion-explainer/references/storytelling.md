# Writing an explainer people can follow

The reader is a developer who learns by **watching**. They need to come away with two things: a mental model ("what talks to what, and why"), and a starting point for their change ("which file do I open").

## Pick the cast (diagram.kymo)

- Aim for 5–9 nodes, never more than 12. One node is one thing with a name in the codebase: a service, a module, a queue, a table, a third party. Group helpers ("utils", "types") into the node that uses them, or leave them out.
- Name nodes the way the code does (`OrderService`, not "Business logic layer"). Put the tech in the subtitle (`"Go · chi"`).
- Lay the diagram out in reading order: initiator on the left, storage and third parties on the right or bottom. The `layout { a | b | { c , d } }` line should read like the story.
- Draw every edge a flow will use, in both directions where there's a response.

## Pick the flows

- A flow is one scenario from trigger to visible outcome: "Log in", "Checkout", "Webhook arrives", "Cache miss".
- 1–4 flows per explainer. A good second flow is the **failure path** (retry, timeout, invalid input), because that's where bugs live.
- Order flows from most common to least common.

## Write the steps

- One step is one hop, or one decision inside a node. If a sentence needs "and then", it's two steps.
- `say` covers what happens **and why it's designed that way**: "…keyed by `order_id` so events for one order stay in order." Skip anything the animation already shows ("the request goes from A to B").
- Use `packet.label` for the thing in motion (`POST /orders`, `OrderCreated`, `200 OK`). Use `payload` for a trimmed, realistic example of 3–6 fields. Never put real secrets in it; write `"••••"`.
- Use a `focus`-only step (no edge) for work inside one component, such as a DB transaction, validation or a cache check.
- Attach `code` refs from the code you actually read, with the line of the function or handler. A wrong line number is worse than none.

## Finish with `next`

2–4 concrete actions tied to the question the user asked:
- "To add a field to the order, change `orders` in `db/schema.sql`, then `OrderCreated` in `events/order.py`."
- "If you're debugging X, look at Y first."

Avoid generic advice ("write tests", "follow best practices").

## Self-check before building

- Can someone who has never seen the repo explain the main flow after one playthrough?
- Does every node appear in at least one step? If not, remove it.
- Does every step's narration fit in about 8 seconds of reading?
