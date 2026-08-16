/** Server-only helpers for the GitHub ⇄ Vercel deploy sync checker. */

export type DeployTarget = {
  label: string;
  url: string;
  reachable: boolean;
  status: number | null;
  commit: string | null;
  branch: string | null;
  bootedAt: string | null;
  error: string | null;
};

export type DeploySyncResult = {
  checkedAt: string;
  config: {
    hasGithubToken: boolean;
    hasVercelToken: boolean;
    repo: string | null;
    branch: string;
    vercelProject: string | null;
  };
  github: {
    ok: boolean;
    sha: string | null;
    message: string | null;
    author: string | null;
    committedAt: string | null;
    error: string | null;
  };
  vercel: {
    ok: boolean;
    deploymentUrl: string | null;
    state: string | null;
    sha: string | null;
    branch: string | null;
    createdAt: string | null;
    error: string | null;
  };
  targets: DeployTarget[];
  verdict: {
    level: "ok" | "warn" | "error" | "unknown";
    headline: string;
    details: string[];
  };
};

const env = (...keys: string[]) => keys.map((k) => process.env[k]).find(Boolean) ?? null;

async function j(url: string, headers: Record<string, string>) {
  const res = await fetch(url, { headers });
  const text = await res.text();
  let body: any = null;
  try { body = JSON.parse(text); } catch { /* non-json */ }
  if (!res.ok) {
    throw new Error(body?.error?.message ?? body?.message ?? `HTTP ${res.status}`);
  }
  return body;
}

async function probe(label: string, url: string): Promise<DeployTarget> {
  const base = url.replace(/\/+$/, "");
  const target: DeployTarget = {
    label, url: base, reachable: false, status: null,
    commit: null, branch: null, bootedAt: null, error: null,
  };
  try {
    const res = await fetch(`${base}/api/public/build-info`, {
      headers: { accept: "application/json" },
    });
    target.status = res.status;
    const text = await res.text();
    let body: any = null;
    try { body = JSON.parse(text); } catch { /* html = old build or auth wall */ }
    if (!body) {
      target.error = res.status === 200
        ? "HTML পাওয়া গেছে — এই deployment এ build-info endpoint নেই (পুরোনো build)"
        : `HTTP ${res.status}`;
      return target;
    }
    target.reachable = true;
    target.commit = body.commit ?? null;
    target.branch = body.branch ?? null;
    target.bootedAt = body.bootedAt ?? null;
  } catch (e: any) {
    target.error = e?.message ?? "unreachable";
  }
  return target;
}

export async function runDeploySync(extraUrls: string[] = []): Promise<DeploySyncResult> {
  const ghToken = env("GITHUB_TOKEN", "GH_TOKEN");
  const vcToken = env("VERCEL_TOKEN");
  const repo = env("GITHUB_REPO"); // "owner/name"
  const branch = env("GITHUB_BRANCH") ?? "main";
  const vcProject = env("VERCEL_PROJECT_ID", "VERCEL_PROJECT_NAME");
  const vcTeam = env("VERCEL_TEAM_ID");

  const out: DeploySyncResult = {
    checkedAt: new Date().toISOString(),
    config: {
      hasGithubToken: !!ghToken,
      hasVercelToken: !!vcToken,
      repo,
      branch,
      vercelProject: vcProject,
    },
    github: { ok: false, sha: null, message: null, author: null, committedAt: null, error: null },
    vercel: { ok: false, deploymentUrl: null, state: null, sha: null, branch: null, createdAt: null, error: null },
    targets: [],
    verdict: { level: "unknown", headline: "", details: [] },
  };

  // --- GitHub: latest commit on the watched branch
  if (ghToken && repo) {
    try {
      const data = await j(
        `https://api.github.com/repos/${repo}/commits/${encodeURIComponent(branch)}`,
        {
          authorization: `Bearer ${ghToken}`,
          accept: "application/vnd.github+json",
          "user-agent": "swus-erp-deploy-sync",
        },
      );
      out.github = {
        ok: true,
        sha: data?.sha ?? null,
        message: (data?.commit?.message ?? "").split("\n")[0] || null,
        author: data?.commit?.author?.name ?? null,
        committedAt: data?.commit?.author?.date ?? null,
        error: null,
      };
    } catch (e: any) {
      out.github.error = e?.message ?? "GitHub API failed";
    }
  } else {
    out.github.error = !ghToken ? "GITHUB_TOKEN নেই" : "GITHUB_REPO নেই";
  }

  // --- Vercel: latest READY production deployment
  if (vcToken && vcProject) {
    try {
      const qs = new URLSearchParams({ projectId: vcProject, limit: "10", target: "production" });
      if (vcTeam) qs.set("teamId", vcTeam);
      const data = await j(`https://api.vercel.com/v6/deployments?${qs}`, {
        authorization: `Bearer ${vcToken}`,
      });
      const dep = (data?.deployments ?? [])[0];
      if (dep) {
        out.vercel = {
          ok: true,
          deploymentUrl: dep.url ? `https://${dep.url}` : null,
          state: dep.state ?? dep.readyState ?? null,
          sha: dep.meta?.githubCommitSha ?? dep.meta?.gitCommitSha ?? null,
          branch: dep.meta?.githubCommitRef ?? dep.meta?.gitCommitRef ?? null,
          createdAt: dep.created ? new Date(dep.created).toISOString() : null,
          error: null,
        };
      } else {
        out.vercel.error = "কোনো production deployment পাওয়া যায়নি";
      }
    } catch (e: any) {
      out.vercel.error = e?.message ?? "Vercel API failed";
    }
  } else {
    out.vercel.error = !vcToken ? "VERCEL_TOKEN নেই" : "VERCEL_PROJECT_ID নেই";
  }

  // --- Live URL probes (always works, no tokens needed)
  const urls = [...new Set(extraUrls.filter(Boolean))];
  out.targets = await Promise.all(urls.map((u, i) => probe(`Target ${i + 1}`, u)));

  // --- Verdict
  const details: string[] = [];
  let level: DeploySyncResult["verdict"]["level"] = "unknown";
  let headline = "যথেষ্ট তথ্য নেই — token/URL যোগ করো";

  const short = (s: string | null) => (s ? s.slice(0, 7) : "—");

  if (out.github.ok && out.vercel.ok) {
    if (out.vercel.branch && out.vercel.branch !== branch) {
      level = "error";
      headline = `Vercel অন্য branch দেখছে: ${out.vercel.branch} (তুমি push করছো ${branch})`;
      details.push(`Vercel project settings এ Production Branch = ${branch} করো।`);
    } else if (out.github.sha && out.vercel.sha && out.github.sha !== out.vercel.sha) {
      level = "warn";
      headline = `Live site পুরোনো — ${short(out.github.sha)} এখনো deploy হয়নি (live: ${short(out.vercel.sha)})`;
      details.push(`শেষ commit: "${out.github.message ?? ""}" (${out.github.committedAt ?? ""})`);
      details.push("Vercel এ build fail করেছে কিনা দেখো, নাহলে redeploy দাও।");
    } else {
      level = "ok";
      headline = `Sync ঠিক আছে — ${branch} @ ${short(out.github.sha)} live`;
    }
    if (out.vercel.state && !["READY", "BUILDING", "QUEUED"].includes(out.vercel.state)) {
      level = "error";
      details.push(`শেষ deployment state: ${out.vercel.state}`);
    }
  } else {
    if (out.github.error) details.push(`GitHub: ${out.github.error}`);
    if (out.vercel.error) details.push(`Vercel: ${out.vercel.error}`);
  }

  // Live probe cross-check
  const commits = out.targets.filter((t) => t.reachable && t.commit).map((t) => t.commit!);
  if (out.github.ok && out.github.sha && commits.length) {
    const stale = out.targets.filter((t) => t.commit && t.commit !== out.github.sha);
    if (stale.length) {
      if (level !== "error") level = "warn";
      for (const t of stale) details.push(`${t.url} → ${short(t.commit)} (branch ${t.branch ?? "?"}) পুরোনো`);
      if (headline.startsWith("যথেষ্ট")) headline = "কিছু live URL পুরোনো commit চালাচ্ছে";
    } else if (level === "unknown") {
      level = "ok";
      headline = "সব live URL সর্বশেষ commit চালাচ্ছে";
    }
  }
  for (const t of out.targets) if (!t.reachable && t.error) details.push(`${t.url}: ${t.error}`);

  out.verdict = { level, headline, details };
  return out;
}
