import { CanvasError, createCanvas, joinSession } from "@github/copilot-sdk/extension";
import {
  getBuilderImplementation,
  searchBuilderImplementations,
  getBuilderSystemOverview,
} from "./catalog.mjs";
import { closeCanvasServer, openCanvasServer } from "./server.mjs";

const canvas = createCanvas({
  id: "qeda-builder-system-map",
  displayName: "Qeda Builder System Map",
  description:
    "Explore the Qeda Builder System architecture, source modules, runtime flows, and focused tests.",
  inputSchema: {
    type: "object",
    properties: {
      workspaceRoot: {
        type: "string",
        description: "Absolute path to the Qeda workspace being documented.",
      },
    },
    required: ["workspaceRoot"],
    additionalProperties: false,
  },
  actions: [
    {
      name: "get_builder_system_overview",
      description:
        "Return the Builder architecture summary, engine choices, workflow, and catalog counts.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      handler: () => getBuilderSystemOverview(),
    },
    {
      name: "search_builder_implementations",
      description:
        "Search Builder implementation areas, file paths, descriptions, tests, and docs.",
      inputSchema: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Words or a source path to search for.",
            maxLength: 200,
          },
          area: {
            type: "string",
            description: "Optionally restrict results to one area ID.",
            maxLength: 80,
          },
        },
        additionalProperties: false,
      },
      handler: ({ input }) => {
        try {
          return searchBuilderImplementations(input);
        } catch (error) {
          if (error instanceof CanvasError) throw error;
          throw new CanvasError("invalid_input", errorMessage(error));
        }
      },
    },
    {
      name: "get_builder_implementation",
      description:
        "Get one complete Builder implementation area with its file-by-file responsibilities.",
      inputSchema: {
        type: "object",
        properties: {
          id: {
            type: "string",
            description: "The area ID returned by search_builder_implementations.",
            maxLength: 80,
          },
        },
        required: ["id"],
        additionalProperties: false,
      },
      handler: ({ input }) => {
        try {
          return getBuilderImplementation(input);
        } catch (error) {
          if (error instanceof CanvasError) throw error;
          throw new CanvasError("invalid_input", errorMessage(error));
        }
      },
    },
  ],
  open: async (ctx) => {
    const workspaceRoot = ctx.input?.workspaceRoot;
    if (typeof workspaceRoot !== "string" || !workspaceRoot.trim()) {
      throw new CanvasError(
        "invalid_input",
        "Open this canvas with an absolute workspaceRoot path.",
      );
    }

    try {
      return await openCanvasServer(ctx.instanceId, workspaceRoot);
    } catch (error) {
      if (error instanceof CanvasError) throw error;
      throw new CanvasError("open_failed", errorMessage(error));
    }
  },
  onClose: async (ctx) => {
    await closeCanvasServer(ctx.instanceId);
  },
});

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

await joinSession({ canvases: [canvas] });
