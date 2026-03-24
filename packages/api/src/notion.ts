/**
 * Notion Integration for EVE
 *
 * Connects to user's Notion workspace to read/create pages.
 * Requires NOTION_API_KEY env var.
 */

const NOTION_API_KEY = process.env.NOTION_API_KEY || "";
const NOTION_BASE = "https://api.notion.com/v1";

async function notionFetch(path: string, options?: RequestInit) {
  if (!NOTION_API_KEY) {
    return { error: "Notion not connected. Set NOTION_API_KEY in environment." };
  }

  const res = await fetch(`${NOTION_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${NOTION_API_KEY}`,
      "Notion-Version": "2022-06-28",
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    return { error: `Notion API error ${res.status}: ${body}` };
  }

  return res.json();
}

export async function searchNotion(query: string) {
  return notionFetch("/search", {
    method: "POST",
    body: JSON.stringify({
      query,
      page_size: 10,
    }),
  });
}

export async function createNotionPage(
  parentId: string,
  title: string,
  content: string,
) {
  return notionFetch("/pages", {
    method: "POST",
    body: JSON.stringify({
      parent: { database_id: parentId },
      properties: {
        title: {
          title: [{ text: { content: title } }],
        },
      },
      children: [
        {
          object: "block",
          type: "paragraph",
          paragraph: {
            rich_text: [{ type: "text", text: { content } }],
          },
        },
      ],
    }),
  });
}

export async function listNotionDatabases() {
  return notionFetch("/search", {
    method: "POST",
    body: JSON.stringify({
      filter: { property: "object", value: "database" },
      page_size: 20,
    }),
  });
}

export const NOTION_CONFIGURED = !!NOTION_API_KEY;

export const NOTION_TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "search_notion",
      description: "Search user's Notion workspace for pages and databases matching a query",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "create_notion_page",
      description: "Create a new page in a Notion database",
      parameters: {
        type: "object",
        properties: {
          parent_id: { type: "string", description: "Notion database ID to create the page in" },
          title: { type: "string", description: "Page title" },
          content: { type: "string", description: "Page content (plain text)" },
        },
        required: ["parent_id", "title", "content"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "list_notion_databases",
      description: "List available Notion databases in the user's workspace",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
];
