/**
 * Settings › MCP API keys — machine credentials for the MCP endpoint
 * (POST /api/mcp). Create shows the raw key exactly once with a copy
 * affordance; the list carries display metadata only; revoke is a
 * timestamp, so revoked keys stay visible.
 */

import type { ApiKeysListResponse, CreateApiKeyResponse } from "@klorn/contract";
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../lib/api";
import { useT } from "../lib/i18n";
import { captureClientError } from "../lib/sentry";
import { useConfirm } from "./confirm-dialog";
import { useToast } from "./toast";

const FIELD =
  "w-full rounded-xl border border-line bg-surface-raised px-3 py-2 text-sm text-ink placeholder:text-ink-dim focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/35";
const BUTTON =
  "ease-strong inline-flex min-h-9 items-center rounded-lg border border-line bg-surface-panel/70 px-3 text-xs font-medium text-ink transition duration-150 hover:bg-surface-panel disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/35";
const BUTTON_PRIMARY =
  "ease-strong inline-flex min-h-9 items-center rounded-lg bg-accent-solid px-3 text-xs font-semibold text-accent-solid-ink transition duration-150 hover:bg-accent-solid-hover disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/35";

export function ApiKeysSection() {
  const { t } = useT();
  const { toast } = useToast();
  const { confirm } = useConfirm();

  const [keys, setKeys] = useState<ApiKeysListResponse["keys"]>([]);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [freshKey, setFreshKey] = useState<CreateApiKeyResponse | null>(null);

  const load = useCallback(() => {
    apiFetch<ApiKeysListResponse>("/api/keys")
      .then((d) => setKeys(d.keys))
      .catch((err) => captureClientError(err, { scope: "settings.api-keys-list" }));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const create = async () => {
    setCreating(true);
    try {
      const res = await apiFetch<CreateApiKeyResponse>("/api/keys", {
        method: "POST",
        body: JSON.stringify({ name }),
      });
      setFreshKey(res);
      setName("");
      load();
    } catch (err) {
      captureClientError(err, { scope: "settings.api-keys-create" });
      toast(t("settings.apiKeys.createFailed"), "error");
    } finally {
      setCreating(false);
    }
  };

  const copyFreshKey = async () => {
    if (!freshKey) return;
    try {
      await navigator.clipboard.writeText(freshKey.key);
      toast(t("settings.apiKeys.copied"), "success");
    } catch {
      // Clipboard can be blocked (permissions, non-secure context) — the key
      // is still on screen to copy by hand, so no error state needed.
    }
  };

  const revoke = async (id: string, keyName: string) => {
    const ok = await confirm({
      title: t("settings.apiKeys.revokeConfirm.title"),
      message: t("settings.apiKeys.revokeConfirm.message", { name: keyName }),
      danger: true,
    });
    if (!ok) return;
    try {
      await apiFetch(`/api/keys/${id}`, { method: "DELETE" });
      toast(t("settings.apiKeys.revokedToast"), "success");
      load();
    } catch (err) {
      captureClientError(err, { scope: "settings.api-keys-revoke" });
      toast(t("settings.apiKeys.revokeFailed"), "error");
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-mid">{t("settings.apiKeys.intro")}</p>

      <div className="flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={60}
          placeholder={t("settings.apiKeys.namePlaceholder")}
          className={FIELD}
        />
        <button
          type="button"
          onClick={create}
          disabled={creating || !name.trim()}
          className={`${BUTTON_PRIMARY} shrink-0`}
        >
          {creating ? t("settings.apiKeys.creating") : t("settings.apiKeys.create")}
        </button>
      </div>

      {freshKey && (
        <div className="space-y-2 rounded-xl border border-line bg-surface-raised p-3">
          <p className="text-xs font-medium text-ink-mid">{t("settings.apiKeys.createdNotice")}</p>
          <code className="block select-all break-all rounded-lg bg-surface-panel px-2 py-1.5 text-xs text-ink">
            {freshKey.key}
          </code>
          <div className="flex gap-2">
            <button type="button" onClick={copyFreshKey} className={BUTTON}>
              {t("settings.apiKeys.copy")}
            </button>
            <button type="button" onClick={() => setFreshKey(null)} className={BUTTON}>
              {t("settings.apiKeys.dismiss")}
            </button>
          </div>
        </div>
      )}

      {keys.length === 0 ? (
        <p className="text-sm text-ink-dim">{t("settings.apiKeys.empty")}</p>
      ) : (
        <ul className="divide-y divide-line-soft">
          {keys.map((key) => (
            <li key={key.id} className="flex items-center gap-2 py-2">
              <span className="min-w-0 flex-1 truncate text-sm text-ink">
                {key.name}
                <span className="ml-2 font-mono text-xs text-ink-dim">{key.prefix}…</span>
              </span>
              {key.revoked ? (
                <span className="rounded-full bg-surface-raised px-2 py-0.5 text-[10px] font-medium text-ink-dim">
                  {t("settings.apiKeys.revokedChip")}
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => revoke(key.id, key.name)}
                  className="text-xs text-ink-dim hover:text-state-danger-ink"
                >
                  {t("settings.apiKeys.revoke")}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
