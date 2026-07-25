import { createCanvas, GlobalFonts } from '@napi-rs/canvas';
import { ServerStatus } from './index';
import path from 'path';

GlobalFonts.registerFromPath(
  path.join(__dirname, 'fonts', 'fusion-pixel-12px-monospaced-zh_hans.ttf'),
  "fusion pixel"      // 字体名称
);
/**
 * 创建Canvas渲染器
 */
function createCanvasRenderer() {
  const CanvasWidth = 480;
  const Padding = 20;
  const LineHeight = 30;

  return {
    /**
     * 绘制纯文本
     * @param content 文本内容
     * @returns 图片缓冲区
     */
    async drawSimpleText(content: string): Promise<Buffer> {
      const lines = content.split('\n');
      const canvasHeight = Padding * 2 + lines.length * LineHeight;

      const canvas = createCanvas(CanvasWidth, canvasHeight);
      const ctx = canvas.getContext('2d');

      // 设置背景和字体
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, CanvasWidth, canvasHeight);
      ctx.font = '22px fusion pixel';
      ctx.fillStyle = 'black';

      // 绘制文本
      lines.forEach((line, i) => {
        ctx.fillText(line, Padding, Padding + (i + 1) * LineHeight);
      });

      return canvas.toBuffer('image/png');
    },

    /**
     * 绘制服务器状态
     * @param statusData 服务器状态数据
     * @returns 图片缓冲区
     */
    async drawServerStatus(statusData: ServerStatus[]): Promise<Buffer> {
      const TITLE_HEIGHT = 20;
      const SERVER_NAME_HEIGHT = 35;
      const ADDRESS_HEIGHT = 35;
      const VERSION_HEIGHT = 35;
      const PLAYER_COUNT_HEIGHT = 35;
      const PLAYER_TAG_TITLE_HEIGHT = 35;
      const PLAYER_TAG_BOTTOM_SPACING = 15;
      const DIVIDER_HEIGHT = 20;
      const PLAYER_TAG_ROW_HEIGHT = 30;

      // 计算画布高度
      let canvasHeight = Padding * 2 + TITLE_HEIGHT;
      statusData.forEach(server => {
        // 基础元素高度
        let serverHeight = DIVIDER_HEIGHT + SERVER_NAME_HEIGHT + ADDRESS_HEIGHT;


        if (server.online && server.players) {
          serverHeight += VERSION_HEIGHT; // 版本行
          serverHeight += PLAYER_COUNT_HEIGHT; // 玩家数量行

          if (server.players.sample?.length) {
            serverHeight += PLAYER_TAG_TITLE_HEIGHT; // 玩家标签标题
            // 玩家标签区域高度 = 行数 * 30px
            serverHeight += Math.ceil(server.players.sample.length / 4) * PLAYER_TAG_ROW_HEIGHT;
            serverHeight += PLAYER_TAG_BOTTOM_SPACING; // 标签底部间距
          }
        }



        canvasHeight += serverHeight;
      });

      const canvas = createCanvas(CanvasWidth, canvasHeight);
      const ctx = canvas.getContext('2d');

      // 设置背景
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, CanvasWidth, canvasHeight);

      // 绘制标题
      ctx.font = 'bold 27px fusion pixel';
      ctx.fillStyle = '#333';
      ctx.fillText('服务器状态', Padding, Padding + TITLE_HEIGHT);

      let yOffset = Padding + TITLE_HEIGHT ;

      // 绘制每个服务器状态
      statusData.forEach(server => {
        const isOnline = server.online;
        const nameColor = isOnline ? '#000000' : '#888888';
        const statusText = isOnline ? '在线' : '离线';
        // 分隔线
        yOffset += DIVIDER_HEIGHT;
        ctx.strokeStyle = '#999';
        ctx.beginPath();
        ctx.moveTo(Padding, yOffset);
        ctx.lineTo(CanvasWidth - Padding, yOffset);
        ctx.stroke();

        yOffset += SERVER_NAME_HEIGHT;
        // 服务器名称
        ctx.font = 'bold 27px fusion pixel';
        ctx.fillStyle = nameColor;
        ctx.fillText(server.name, Padding, yOffset);

        // 状态文本（普通样式）
        ctx.font = '25px fusion pixel';
        const statusWidth = ctx.measureText(statusText).width;
        ctx.fillText(statusText, CanvasWidth - Padding - statusWidth, yOffset);
        yOffset += ADDRESS_HEIGHT;

        // 服务器详情
        ctx.font = '25px fusion pixel';
        ctx.fillStyle = '#555';
        ctx.fillText(`地址: ${server.address}:${server.port}`, Padding, yOffset);

        if (isOnline && server.players) {

          yOffset += VERSION_HEIGHT;
          ctx.fillText(`版本: ${server.version || '-'}`, Padding, yOffset);

          yOffset += PLAYER_COUNT_HEIGHT;
          ctx.fillText(`玩家: ${server.players.online}/${server.players.max}`, Padding, yOffset);

          // 绘制玩家标签
          if (server.players.sample?.length) {
            yOffset += PLAYER_TAG_TITLE_HEIGHT;
            let xPos = Padding;
            server.players.sample.forEach(player => {
              const tagWidth = ctx.measureText(player).width + 20;

              if (xPos + tagWidth > CanvasWidth - Padding) {
                xPos = Padding;
                yOffset += PLAYER_TAG_ROW_HEIGHT;
              }

              // 玩家标签背景
              ctx.fillStyle = '#f5f5f5';
              ctx.fillRect(xPos, yOffset - 20, tagWidth, 25);

              // 玩家名字
              ctx.fillStyle = '#555';
              ctx.font = '18px fusion pixel';
              ctx.fillText(player, xPos + 10, yOffset);

              xPos += tagWidth + 4;
            });
            yOffset += PLAYER_TAG_BOTTOM_SPACING;
          }
        }


      });

      return canvas.toBuffer('image/png');
    }
  };
}

/**
 * 生成服务器状态图片
 * @param content 文本内容或服务器状态数据
 * @returns 图片缓冲区
 */
export async function generateStatusImage(content: string | ServerStatus[]): Promise<Buffer> {
  const renderer = createCanvasRenderer();

  if (typeof content === 'string') {
    return renderer.drawSimpleText(content);
  } else {
    return renderer.drawServerStatus(content);
  }
}
