import { describe, it, expect } from 'vitest';
import { appendResourcePrompt } from './resourcePrompt';

describe('appendResourcePrompt(按玩家知识过滤)', () => {
  it('初始状态不暴露隐藏地点与背景', () => {
    const prompt = appendResourcePrompt('测试', 'home-day', { knowledgeEvents: [] });
    expect(prompt).not.toContain('detective-inn');
    expect(prompt).not.toContain('water-tower');
    expect(prompt).not.toContain('observation-deck');
    expect(prompt).toContain('- home:');
    expect(prompt).toContain('- school:');
    expect(prompt).toContain('- supermarket:');
    expect(prompt).toContain('school-night');
  });

  it('初始状态不暴露未认识角色的真实姓名', () => {
    const prompt = appendResourcePrompt('测试', 'home-day', { knowledgeEvents: [] });
    expect(prompt).not.toContain('赵刚');
    expect(prompt).not.toContain('林静');
    expect(prompt).not.toContain('周德明');
    expect(prompt).toContain('文穗');
  });

  it('允许 discovery 的角色以玩家可见称呼出现', () => {
    const prompt = appendResourcePrompt('测试', 'supermarket-day', {
      knowledgeEvents: [],
      location: 'supermarket',
    });
    // meet:chen-huihui 在便利店可触发,立绘可用但称呼是玩家可见名
    expect(prompt).toContain('chen-huihui-normal');
    expect(prompt).toContain('陈慧慧');
    // meet:liu-renguang 只在学校触发,便利店不应出现
    expect(prompt).not.toContain('liu-renguang');
  });

  it('observe 后侦探立绘用"寸头男人"称呼且不含真名', () => {
    const prompt = appendResourcePrompt('测试', 'street', {
      knowledgeEvents: ['observe:shaved-man'],
    });
    expect(prompt).toContain('detective-a-normal');
    expect(prompt).toContain('寸头男人');
    expect(prompt).not.toContain('赵刚');
  });

  it('identify 后显示真名与原始描述', () => {
    const prompt = appendResourcePrompt('测试', 'street', {
      knowledgeEvents: ['observe:shaved-man', 'follow:shaved-man-to-inn', 'identify:zhao-gang'],
    });
    expect(prompt).toContain('赵刚');
  });

  it('解锁水塔路线后暴露水塔地点与背景', () => {
    const prompt = appendResourcePrompt('测试', 'home-day', {
      knowledgeEvents: ['find:water-tower-fragment', 'locate:water-tower-route'],
    });
    expect(prompt).toContain('- water-tower:');
    expect(prompt).toContain('water-tower-exterior');
  });

  it('rumored 地点标注不可前往且不暴露对应背景', () => {
    const prompt = appendResourcePrompt('测试', 'home-day', {
      knowledgeEvents: ['find:water-tower-fragment'],
    });
    expect(prompt).toContain('传闻');
    expect(prompt).not.toContain('water-tower-exterior.png');
  });

  it('当前背景即使未解锁也保留在清单中', () => {
    const prompt = appendResourcePrompt('测试', 'observation-deck', { knowledgeEvents: [] });
    expect(prompt).toContain('observation-deck.png');
  });
});
