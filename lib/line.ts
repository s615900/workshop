type Card = {
  bookingId: string;
  department: string;
  name: string;
  productName: string;
  receivedDate: string;
};

const BLUE = "#3643BA";

function row(label: string, value: string) {
  return {
    type: "box",
    layout: "horizontal",
    contents: [
      { type: "text", text: label, size: "sm", color: "#888888", flex: 2 },
      { type: "text", text: value || "-", size: "sm", color: "#222222", flex: 5, wrap: true },
    ],
  };
}

// 登記完成卡片（LINE Flex Message）
function bookingCard(c: Card) {
  return {
    type: "flex",
    altText: `維修登記完成 ${c.bookingId}`,
    contents: {
      type: "bubble",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: BLUE,
        paddingAll: "16px",
        contents: [{ type: "text", text: "維修登記完成", color: "#FFFFFF", weight: "bold", size: "lg" }],
      },
      body: {
        type: "box",
        layout: "vertical",
        spacing: "md",
        contents: [
          { type: "text", text: "維修編號", size: "sm", color: "#888888" },
          { type: "text", text: c.bookingId, size: "3xl", weight: "bold", color: BLUE },
          { type: "separator", margin: "md" },
          row("部門", c.department),
          row("顧客姓名", c.name),
          row("商品名稱", c.productName),
          row("接單日期", c.receivedDate),
        ],
      },
      footer: {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "text",
            text: "維修保養完畢後，迪卡儂將以 LINE 訊息通知您取件。",
            size: "xs",
            color: "#888888",
            wrap: true,
          },
        ],
      },
    },
  };
}

// 用官方帳號（Messaging API）推播給客人；沒設定 token 或客人未加好友時不影響登記
export async function pushBookingCard(userId: string, card: Card) {
  const token = process.env.LINE_MESSAGING_TOKEN;
  if (!token || !userId) return;
  const res = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ to: userId, messages: [bookingCard(card)] }),
  });
  if (!res.ok) console.error("LINE 推播失敗", res.status, await res.text());
}
