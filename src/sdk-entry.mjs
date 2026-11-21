// 打包成浏览器全局变量 window.Anthropic，供 App 中的 Claude 客户端按需加载
import Anthropic from '@anthropic-ai/sdk';
window.Anthropic = Anthropic;
