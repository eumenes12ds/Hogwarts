import { recoverHogwartsPatch } from '@/function/update/hogwarts_patch_recovery';
import { extractCommands, updateVariables } from '@/function/update_variables';

const patch = '[{"op":"replace","path":"/世界/日時情報/現在時刻","value":"午前08:55"},{"op":"replace","path":"/世界/位置情報/現在地点","value":"ダイアゴン横丁の通り（書店の前）"}]';
const wrap = (body: string) => `<gametxt>本文</gametxt><UpdateVariable><Analysis>確認</Analysis><JSONPatch>${body}</UpdateVariable><options>1. 続ける</options>`;

describe('Hogwarts missing inner closing tag', () => {
    test('recovers complete JSON without editing the original, and is idempotent', () => {
        const original = wrap(patch);
        const result = recoverHogwartsPatch(original);
        expect(result.recovered).toBe(true);
        expect(result.error).toBeUndefined();
        expect(result.text).toBe(original.replace('</UpdateVariable>', '</JSONPatch>\n</UpdateVariable>'));
        expect(extractCommands(result.text)).toHaveLength(2);
        expect(recoverHogwartsPatch(result.text)).toEqual({ text: result.text, recovered: false });
        expect(original).not.toContain('</JSONPatch>');
    });

    test('ignores tag-looking text inside data and analysis', () => {
        const input = wrap('[{"op":"replace","path":"/記憶","value":"</UpdateVariable> </JSONPatch> 攻撃: 30SP"}]');
        expect(recoverHogwartsPatch(input).recovered).toBe(true);
        expect(recoverHogwartsPatch('<think><JSONPatch>incomplete example</think>本文').error).toBeUndefined();
    });

    test.each([
        '[{"op":"replace","path":"/x","value":1}',
        '[{"op":"replace","path":"/x","value":1},]',
        '[{"op":"replace","path":"x","value":1}]',
        '[{"op":"replace","path":"/x~2","value":1}]',
        '[{"op":"replace","path":"/__proto__/x","value":1}]',
        '[{"op":"replace","path":"/x","value":{"constructor":1}}]',
        '[{"op":"replace","path":"/x","value":1e999}]',
        '[{"op":"replace","path":"/x"}]',
        '[{"op":"delta","path":"/x","value":"1"}]',
        '[{"op":"execute","path":"/x","value":1}]',
        '```json\n[]\n```',
        '[] trailing prose',
        '{"op":"replace","path":"/x","value":1}'
    ])('rejects unsafe/incomplete content: %s', body => {
        const input = wrap(body), result = recoverHogwartsPatch(input);
        expect(result.text).toBe(input);
        expect(result.recovered).toBe(false);
        expect(result.error).toContain('状態の更新を適用できませんでした');
    });

    test.each([
        '<JSONPatch>[]',
        '<UpdateVariable><JSONPatch>[]',
        '<Update><JSONPatch>[]</UpdateVariable>',
        '<UpdateVariable><JSONPatch>[]</UpdateVariable><JSONPatch>[]</JSONPatch>',
        '<UpdateVariable><JSONPatch>[]</UpdateVariable></UpdateVariable>',
        '<UpdateVariable><JSONPatch><JSONPatch>[]</JSONPatch></UpdateVariable>'
    ])('rejects ambiguous boundaries: %s', input => expect(recoverHogwartsPatch(input).error).toBeDefined());

    test('ordinary complete/absent patches are unchanged', () => {
        for (const input of ['本文', '<UpdateVariable><JSONPatch>[]</JSONPatch></UpdateVariable>'])
            expect(recoverHogwartsPatch(input)).toEqual({ text: input, recovered: false });
    });

    test('native update path applies both recovered commands and reports rejected data', async () => {
        const state: any = {stat_data:{世界:{日時情報:{現在時刻:'午前08:50'},位置情報:{現在地点:'ダイアゴン横丁'}}},initialized_lorebooks:{},schema:{type:'object',properties:{}}};
        const errors: string[] = [];
        await updateVariables(wrap(patch), state, errors);
        expect(errors).toEqual([]);
        expect(state.stat_data.世界.日時情報.現在時刻).toBe('午前08:55');
        expect(state.stat_data.世界.位置情報.現在地点).toBe('ダイアゴン横丁の通り（書店の前）');
        const before = JSON.stringify(state);
        expect(await updateVariables(wrap('['), state, errors)).toBe(false);
        expect(JSON.stringify(state)).toBe(before);
        expect(errors).toHaveLength(1);
    });
});
