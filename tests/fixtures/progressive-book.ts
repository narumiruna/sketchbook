import type { Chapter, Section } from "../../src/book.js"
import type { SketchbookDocument } from "../../src/document.js"
import { drawing } from "./static-drawing.js"

export const codebaseOverview: SketchbookDocument = {
  schemaVersion: 1,
  title: "What Sketchbook does",
  blocks: [
    {
      id: "overview",
      type: "markdown",
      markdown: `Sketchbook saves local technical walkthroughs and opens them in a read-only browser Viewer.

- **Write and read** from Pi or a standalone MCP client.
- **Explain an idea** with Markdown, code, math, and diagrams.
- **Read at your pace** with chapters and slide navigation.`,
    },
  ],
}

export const chatOverview: SketchbookDocument = {
  schemaVersion: 1,
  title: "How a message travels",
  blocks: [
    {
      id: "overview",
      type: "markdown",
      markdown: `This example chat app lets conversation members send messages, read history, and receive new messages live. It is a teaching design, not a description of an existing service.

A **conversation** is a shared message stream. To send a message, the client asks the API to save it in the database (DB). An **acknowledgment**, or ack, tells the sender that the write committed, not that another member saw it.`,
    },
    {
      id: "message-path",
      type: "diagram-deck",
      title: "Send and save",
      slides: [
        {
          id: "send",
          title: "Ack after commit",
          svg: drawing("Send → Commit → Ack"),
          explanationMarkdown:
            "The API checks membership before writing. The database assigns a position in the conversation and saves the text. The API returns that position in the ack only after the database confirms the commit.",
        },
      ],
    },
    {
      id: "takeaway",
      type: "markdown",
      markdown:
        "The save and the live update are separate. A missed ack or a missed live update does not undo a saved message.",
    },
  ],
}

export const chatFirstSection: Section = {
  id: "delivery",
  title: "What delivery means",
  blocks: [
    {
      id: "delivery-status",
      type: "markdown",
      markdown: `The sender sees **pending** until it gets an ack. It can then show **saved**. Neither state tells the sender whether a recipient opened the conversation; this example does not implement read receipts.

A recipient might see the live event before the sender gets the ack. If a recipient is offline, the same message is still available in history after reconnecting.`,
    },
  ],
}

export const chatChapters: Chapter[] = [
  {
    id: "architecture",
    title: "System architecture",
    blocks: [
      {
        id: "roles",
        type: "markdown",
        markdown: `The **Client** displays history and tracks the last position it has received without a gap. The **API** checks access, accepts sends, and serves history. The **DB** is the source of truth for membership and messages. The **Relay** watches committed messages and streams updates to connected members.`,
      },
      {
        id: "components",
        type: "diagram-deck",
        title: "Component map",
        slides: [
          {
            id: "roles",
            title: "Save path and live path",
            svg: drawing("Client → API → DB; Relay → Client"),
            explanationMarkdown:
              "The arrows show component responsibilities, not the order of requests. The API can save a message even when no one is connected. The Relay watches committed rows, so it cannot deliver a draft or an uncommitted write.",
          },
        ],
      },
    ],
    sections: [
      {
        id: "reconnect",
        title: "Recover a missed update",
        blocks: [
          {
            id: "catch-up",
            type: "markdown",
            markdown: `A **cursor** is the highest position the client has received without a gap. If it has messages up to 41 and receives 43, it keeps cursor 41 and asks for history after 41. It fills in 42, keeps only one copy of 43, and then advances the cursor.

The live stream reduces delay. Ordered history makes missed or repeated events recoverable.`,
          },
        ],
      },
    ],
  },
  {
    id: "api",
    title: "API design",
    blocks: [
      {
        id: "contract",
        type: "markdown",
        markdown: `The API checks the caller's conversation membership before accepting a send, reading history, or opening a subscription. Each call has a distinct job: send saves text, history reads committed messages, and subscribe follows new ones. Retry uses the same send endpoint.`,
      },
    ],
    sections: [
      {
        id: "send",
        title: "Send",
        blocks: [
          {
            id: "send-contract",
            type: "markdown",
            markdown: `\`POST /chats/{id}/messages\` takes the text and a **client message ID**, a fresh ID for one intended send. Keep the ID until the send has a result. A successful response includes the ID, message text, and position assigned by the database. The client uses the same fields to reconcile a pending item with its saved copy.`,
          },
          {
            id: "send-body",
            type: "code",
            language: "JSON",
            code: '{\n  "clientMessageId": "send-17",\n  "text": "See you at noon."\n}',
          },
        ],
      },
      {
        id: "history",
        title: "History",
        blocks: [
          {
            id: "history-contract",
            type: "markdown",
            markdown: `\`GET /chats/{id}/messages?after=41\` returns committed messages with positions greater than 41, oldest first. Results have a size limit. If more remain, request the next slice after the last position returned. Use positions, not client clocks, to order the conversation.`,
          },
        ],
      },
      {
        id: "subscribe",
        title: "Subscribe",
        blocks: [
          {
            id: "subscribe-contract",
            type: "markdown",
            markdown: `\`GET /chats/{id}/events?after=41\` opens a stream through the Relay. The stream starts after the supplied cursor and follows committed messages. Each event carries the conversation ID and position. Repeated events are possible, so the client merges them by those two fields and uses history if it detects a gap.`,
          },
        ],
      },
      {
        id: "retry",
        title: "Retry",
        blocks: [
          {
            id: "retry-contract",
            type: "markdown",
            markdown: `A timeout does not tell the client whether the original send committed. Retry the same conversation, client message ID, and text. The server looks up that ID in the context of the conversation and authenticated sender.`,
          },
          {
            id: "send-retry",
            type: "diagram-deck",
            title: "Safe send retries",
            slides: [
              {
                id: "lost-ack",
                title: "When an ack is lost",
                svg: drawing("Send 17 → Ack lost → Retry 17 → Ack 42"),
                explanationMarkdown:
                  "The first request saves position 42 but the client never gets its response. Reusing client message ID 17 lets the API return position 42 again, without creating a second message.",
              },
              {
                id: "key-match",
                title: "When an ID already exists",
                svg: drawing("Same text? Yes: ack. No: reject."),
                explanationMarkdown:
                  "Once the API finds an existing ID for this sender and conversation, matching text returns the saved result. Different text returns HTTP 409 Conflict and leaves the existing message unchanged. If no row exists, the normal send path can create it.",
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: "database",
    title: "Database design",
    blocks: [
      {
        id: "records",
        type: "markdown",
        markdown: `The database stores conversations (**CHAT**), membership rows (**MEMBER**), and saved messages (**MSG**). A membership row links one user to one conversation. Each saved message belongs to one conversation and records the sender, client message ID, text, and position.`,
      },
      {
        id: "relationships",
        type: "diagram-deck",
        title: "Stored relationships",
        slides: [
          {
            id: "chat-tables",
            title: "Members and messages",
            svg: drawing("CHAT has MEMBER and MSG rows"),
            explanationMarkdown:
              "A conversation can have multiple membership and message rows. Each row belongs to one conversation. Membership controls access; the message rows preserve content and order.",
          },
        ],
      },
    ],
    sections: [
      {
        id: "order",
        title: "Message order",
        blocks: [
          {
            id: "position",
            type: "markdown",
            markdown: `Each conversation has its own counter. In one transaction, a new send advances the counter and inserts a row at that position. Locking the conversation's counter serializes simultaneous sends there. The transaction commits both changes or neither. History reads and sorts the committed rows by position within that conversation.`,
          },
        ],
      },
      {
        id: "deduplication",
        title: "Deduplication",
        blocks: [
          {
            id: "key-scopes",
            type: "markdown",
            markdown: `**Deduplication** means storing one row for one intended send. Under the counter lock, check the sender's client message ID before advancing the counter. A matching retry returns the original row; it uses no new position. The database enforces the two independent rules below: one row at a position, and one row for a send ID within a sender and conversation.`,
          },
          {
            id: "constraints",
            type: "code",
            language: "SQL",
            code: "UNIQUE (chat_id, position),\nUNIQUE (chat_id, sender_id, client_message_id)",
          },
        ],
      },
    ],
  },
]

export const chatExtraChapter: Chapter = {
  id: "operations",
  title: "Slow connections",
  blocks: [
    {
      id: "queue-limit",
      type: "markdown",
      markdown: `The Relay limits the number of pending events per connection. When a client cannot keep up, the Relay closes that stream instead of growing its queue without a bound. The client starts again from its last complete cursor and uses history to fill gaps. This can delay delivery; it does not delete saved messages.`,
    },
  ],
  sections: [],
}
