# `explainer.json` schema

```jsonc
{
  "title": "How login works",                 // required: the header, and the question being answered
  "summary": "One or two sentences. `code` and **bold** work.",  // shown on the overview step
  "diagram": "diagram.kymo",                  // optional, default "diagram.kymo" (relative to this file)
  "root": "../..",                            // optional: the project root that code[].file is relative to.
                                              // Default: nearest ancestor with .git, else the cwd at build time.

  "nodes": {                                  // optional: per-node detail, shown when a node is clicked
    "api": {
      "desc": "What this component is responsible for.",
      "subtitle": "overrides the .kymo subtitle",
      "code": [{ "file": "src/server.ts", "line": 12 }]
    }
  },

  "flows": [                                  // required: 1–4 flows, each shown as a tab
    {
      "id": "login",                          // required: kebab-case, used in the URL (#login/3)
      "label": "Log in",                      // required: tab text
      "description": "Shown on this flow's overview step.",
      "steps": [                              // required: 1–12 (aim for 4–10)
        {
          "edge": "spa->api",                 // a hop: the packet travels this edge. Use node ids from the .kymo.
                                              // If only api->spa is drawn, the packet runs it backwards.
                                              // A second edge between the same pair is "spa->api~2".
          "focus": ["api"],                   // nodes to highlight. Defaults to the edge's endpoints.
                                              // A step needs an edge, a focus, or both.
          "title": "optional heading, replaces the 'A → B' chips",
          "packet": {
            "label": "POST /login",           // text on the moving packet (keep it under ~30 chars)
            "payload": { "email": "a@b.co" }  // object → highlighted JSON, string → shown verbatim
          },
          "say": "Narration. One idea, 1–3 sentences. `code` and **bold** work.",   // required
          "code": [                           // file:line references; links open in VS Code
            { "file": "src/routes/auth.ts", "line": 42, "note": "loginHandler" }
          ]
        }
      ]
    }
  ],

  "next": [                                   // shown on each flow's last step: "What to do next"
    "To add a provider, edit `src/auth/providers.ts`.",
    { "text": "Session TTL lives here", "file": "src/config.ts", "line": 8 }
  ]
}
```

## Validation (run by `build.mjs`)

**Errors** stop the build:
- missing `title`
- no flows
- a flow without `id` or `label`, or a duplicate flow id
- a step without `say`, or without both `edge` and `focus`
- an `edge` or `focus` naming a node that isn't in the diagram
- malformed `code` lines

**Warnings** are printed and shown in a banner in the player:
- a step's edge isn't drawn (the packet flies in a straight dashed line)
- a code file doesn't exist under `root`
- placeholder text (`TODO`, `TBD`, `<your …>`)
- more than 14 nodes or 12 steps
- no `next`
- Kymo quirks: region edges, named layout containers, nodes or edges missing from the SVG
