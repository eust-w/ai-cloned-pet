import { useCallback, useEffect, useState } from "react";
import {
  Brain,
  CheckCircle2,
  Download,
  FileSearch,
  PawPrint,
  Plus,
  Send,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload
} from "lucide-react";
import type {
  AvatarStyle,
  HealthResponse,
  MediaRecord,
  PetDetailResponse,
  PlannerResponse,
  Species,
  TouchZone
} from "../shared/types.js";
import {
  ApiError,
  analyzePet,
  createAvatarAsset,
  createMotionAssets,
  createPet,
  deletePet,
  getHealth,
  getPet,
  listPets,
  planInteraction,
  uploadMedia
} from "./lib/api.js";
import { getInitialLocale, type I18nMessages, type Locale, messages, type StatusKey } from "./lib/i18n.js";
import { StatusPill } from "./components/StatusPill.js";
import { VirtualPetViewer } from "./components/VirtualPetViewer.js";

export function App() {
  const [locale, setLocale] = useState<Locale>(getInitialLocale);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [pets, setPets] = useState<PetDetailResponse["pet"][]>([]);
  const [selectedPetId, setSelectedPetId] = useState<string | null>(null);
  const [detail, setDetail] = useState<PetDetailResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [runtimePlan, setRuntimePlan] = useState<PlannerResponse | null>(null);
  const t = messages[locale];

  const changeLocale = useCallback((nextLocale: Locale) => {
    setLocale(nextLocale);
  }, []);

  const refreshPets = useCallback(async () => {
    const response = await listPets();
    setPets(response.pets);
    setSelectedPetId((current) => current ?? response.pets[0]?.id ?? null);
  }, []);

  const refreshSelected = useCallback(async () => {
    if (!selectedPetId) {
      setDetail(null);
      return;
    }
    setDetail(null);
    const response = await getPet(selectedPetId);
    setDetail(response);
  }, [selectedPetId]);

  useEffect(() => {
    setRuntimePlan(null);
  }, [selectedPetId]);

  useEffect(() => {
    void runTask(setBusy, setError, "load", async () => {
      const [healthResponse] = await Promise.all([getHealth(), refreshPets()]);
      setHealth(healthResponse);
    });
  }, [refreshPets]);

  useEffect(() => {
    void runTask(setBusy, setError, "detail", refreshSelected);
  }, [refreshSelected]);

  const latestAvatar = detail?.avatarAssets[0] ?? null;
  const hasInteractiveAsset = Boolean(latestAvatar || detail?.motionAssets.length);

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            <PawPrint size={22} />
          </div>
          <div>
            <h1>{t.brandTitle}</h1>
            <p>{t.brandSubtitle}</p>
          </div>
        </div>

        <ProviderPanel health={health} t={t} />
        <PetSwitcher
          pets={pets}
          selectedPetId={selectedPetId}
          t={t}
          onSelect={setSelectedPetId}
          onCreate={async (input) => {
            await runTask(setBusy, setError, "create", async () => {
              const created = await createPet(input);
              setDetail(created);
              setSelectedPetId(created.pet.id);
              await refreshPets();
            });
          }}
        />
        <StepRail detail={detail} t={t} />
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <span className="section-label">{t.topbar.workbench}</span>
            <h2>{detail?.pet.name ?? t.topbar.createProject}</h2>
          </div>
          <div className="topbar-actions">
            <LanguageToggle locale={locale} onChange={changeLocale} t={t} />
            {detail ? (
              <>
                <a className="icon-button" href={`/api/pets/${detail.pet.id}/export`} title={t.topbar.exportJson}>
                  <Download size={17} />
                </a>
                <button
                  className="icon-button danger"
                  title={t.topbar.deletePet}
                  disabled={Boolean(busy)}
                  onClick={() => {
                    void runTask(setBusy, setError, "delete", async () => {
                      await deletePet(detail.pet.id);
                      setDetail(null);
                      setSelectedPetId(null);
                      await refreshPets();
                    });
                  }}
                >
                  <Trash2 size={17} />
                </button>
              </>
            ) : null}
          </div>
        </header>

        {error ? <div className="error-banner">{error}</div> : null}

        {detail ? (
          <div className="content-grid">
            <section className="main-column">
              <PetSummary detail={detail} t={t} />
              <MediaPanel
                detail={detail}
                busy={busy}
                t={t}
                onUpload={async (files) => {
                  await runTask(setBusy, setError, "upload", async () => {
                    const response = await uploadMedia(detail.pet.id, files);
                    setDetail(response.detail);
                    await refreshPets();
                  });
                }}
                onAnalyze={async () => {
                  await runTask(setBusy, setError, "analyze", async () => {
                    const response = await analyzePet(detail.pet.id);
                    setDetail(response);
                    await refreshPets();
                  });
                }}
              />
              <GenerationPanel
                detail={detail}
                busy={busy}
                imageConfigured={Boolean(health?.providers.image)}
                t={t}
                onGenerateAvatar={async (style, sourceMediaId, forceRegenerate) => {
                  await runTask(setBusy, setError, "avatar", async () => {
                    const response = await createAvatarAsset(detail.pet.id, style, sourceMediaId || undefined, forceRegenerate);
                    setDetail(response);
                    await refreshPets();
                  });
                }}
                onBuildAtlas={async () => {
                  await runTask(setBusy, setError, "atlas", async () => {
                    const response = await createMotionAssets(detail.pet.id);
                    setDetail(response);
                    await refreshPets();
                  });
                }}
              />
            </section>

            <section className="viewer-column">
              <VirtualPetViewer avatar={latestAvatar} activePlan={runtimePlan} labels={t.virtualPet} motionLabels={t.motionAction} />
              <InteractionPanel
                detail={detail}
                busy={busy}
                enabled={hasInteractiveAsset}
                locale={locale}
                t={t}
                onPlan={setBusy}
                onError={setError}
                onPlanResult={setRuntimePlan}
              />
            </section>
          </div>
        ) : (
          <EmptyState t={t} />
        )}
      </section>
    </main>
  );
}

function LanguageToggle({ locale, onChange, t }: { locale: Locale; onChange: (locale: Locale) => void; t: I18nMessages }) {
  return (
    <div className="language-toggle" aria-label={t.languageSwitch}>
      <button className={locale === "zh" ? "selected" : ""} onClick={() => onChange("zh")} type="button">
        中文
      </button>
      <button className={locale === "en" ? "selected" : ""} onClick={() => onChange("en")} type="button">
        EN
      </button>
    </div>
  );
}

function ProviderPanel({ health, t }: { health: HealthResponse | null; t: I18nMessages }) {
  return (
    <div className="provider-panel">
      <div className="provider-row">
        <span>{t.providers.image}</span>
        <StatusPill status={health?.providers.image ? "configured" : "missing"} label={statusLabel(t, health?.providers.image ? "configured" : "missing")} />
      </div>
      <div className="provider-row">
        <span>{t.providers.openai}</span>
        <StatusPill status={health?.providers.openai ? "configured" : "missing"} label={statusLabel(t, health?.providers.openai ? "configured" : "missing")} />
      </div>
      <div className="provider-row">
        <span>{t.providers.ffmpeg}</span>
        <StatusPill status={health?.ffmpeg ? "configured" : "missing"} label={statusLabel(t, health?.ffmpeg ? "configured" : "missing")} />
      </div>
    </div>
  );
}

function PetSwitcher({
  pets,
  selectedPetId,
  t,
  onSelect,
  onCreate
}: {
  pets: PetDetailResponse["pet"][];
  selectedPetId: string | null;
  t: I18nMessages;
  onSelect: (id: string) => void;
  onCreate: (input: { name: string; species: Species; personalityNotes: string; consentAccepted: true }) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [species, setSpecies] = useState<Species>("unknown");
  const [personalityNotes, setPersonalityNotes] = useState("");
  const [consentAccepted, setConsentAccepted] = useState(false);

  return (
    <div className="pet-switcher">
      <div className="pet-list">
        {pets.map((pet) => (
          <button key={pet.id} className={pet.id === selectedPetId ? "pet-row selected" : "pet-row"} onClick={() => onSelect(pet.id)}>
            <span>{pet.name}</span>
            <StatusPill status={pet.status} label={statusLabel(t, pet.status)} />
          </button>
        ))}
      </div>

      <form
        className="create-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (!consentAccepted) {
            return;
          }
          void onCreate({ name, species, personalityNotes, consentAccepted: true }).then(() => {
            setName("");
            setPersonalityNotes("");
            setSpecies("unknown");
            setConsentAccepted(false);
          });
        }}
      >
        <label>
          {t.create.name}
          <input value={name} onChange={(event) => setName(event.target.value)} required maxLength={80} />
        </label>
        <label>
          {t.create.species}
          <select value={species} onChange={(event) => setSpecies(event.target.value as Species)}>
            <option value="unknown">{t.create.unknown}</option>
            <option value="cat">{t.create.cat}</option>
            <option value="dog">{t.create.dog}</option>
          </select>
        </label>
        <label>
          {t.create.personalityNotes}
          <textarea value={personalityNotes} onChange={(event) => setPersonalityNotes(event.target.value)} rows={3} maxLength={2000} />
        </label>
        <label className="checkbox-row">
          <input type="checkbox" checked={consentAccepted} onChange={(event) => setConsentAccepted(event.target.checked)} />
          <span>{t.create.consent}</span>
        </label>
        <button className="primary-button" type="submit" disabled={!name || !consentAccepted}>
          <Plus size={16} />
          {t.create.create}
        </button>
      </form>
    </div>
  );
}

function StepRail({ detail, t }: { detail: PetDetailResponse | null; t: I18nMessages }) {
  const status = detail?.pet.status;
  const hasAssets = Boolean(detail?.avatarAssets.length || detail?.motionAssets.length);
  const steps = [
    [t.steps.createPet, Boolean(detail)],
    [t.steps.uploadMedia, Boolean(detail?.media.length)],
    [t.steps.analyze, status === "profile_ready" || status === "asset_ready" || status === "model_ready"],
    [t.steps.buildAssets, hasAssets],
    [t.steps.interact, hasAssets]
  ] as const;
  return (
    <div className="step-rail">
      {steps.map(([label, done], index) => (
        <div className={done ? "step done" : "step"} key={label}>
          <span>{done ? <CheckCircle2 size={16} /> : index + 1}</span>
          <p>{label}</p>
        </div>
      ))}
    </div>
  );
}

function PetSummary({ detail, t }: { detail: PetDetailResponse; t: I18nMessages }) {
  const profile = detail.pet.identityProfile;
  return (
    <section className="panel summary-panel">
      <div className="panel-heading">
        <div>
          <span className="section-label">{t.identity.title}</span>
          <h3>{detail.pet.name}</h3>
        </div>
        <StatusPill status={detail.pet.status} label={statusLabel(t, detail.pet.status)} />
      </div>
      {profile ? (
        <div className="profile-grid">
          <Metric label={t.identity.species} value={t.species[profile.species]} />
          <Metric label={t.identity.confidence} value={`${Math.round(profile.confidence * 100)}%`} />
          <Metric label={t.identity.coat} value={profile.coatColors.join(", ") || t.identity.unknown} />
          <Metric label={t.identity.eyes} value={profile.eyeColor || t.identity.unknown} />
          <div className="wide-note">{profile.distinctiveMarks.join(" · ") || t.identity.noMarks}</div>
        </div>
      ) : (
        <div className="panel-empty">{t.identity.empty}</div>
      )}
    </section>
  );
}

function MediaPanel({
  detail,
  busy,
  t,
  onUpload,
  onAnalyze
}: {
  detail: PetDetailResponse;
  busy: string | null;
  t: I18nMessages;
  onUpload: (files: FileList) => Promise<void>;
  onAnalyze: () => Promise<void>;
}) {
  const hasProfile = Boolean(detail.pet.identityProfile);

  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <span className="section-label">{t.media.title}</span>
          <h3>{t.media.subtitle}</h3>
        </div>
        <button className="secondary-button" onClick={() => void onAnalyze()} disabled={!detail.media.length || hasProfile || Boolean(busy)}>
          <Brain size={16} />
          {hasProfile ? t.media.profileReady : t.media.analyze}
        </button>
      </div>
      <label className="dropzone">
        <Upload size={22} />
        <span>{t.media.upload}</span>
        <input
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm,audio/mpeg,audio/mp4,audio/wav,audio/webm"
          onChange={(event) => {
            if (event.target.files?.length) {
              void onUpload(event.target.files);
              event.target.value = "";
            }
          }}
        />
      </label>
      <div className="media-list">
        {detail.media.map((item) => (
          <MediaRow key={item.id} media={item} t={t} />
        ))}
        {!detail.media.length ? <div className="panel-empty">{t.media.noMedia}</div> : null}
      </div>
    </section>
  );
}

function MediaRow({ media, t }: { media: MediaRecord; t: I18nMessages }) {
  return (
    <div className="media-row">
      {media.kind === "image" ? <img src={`/api/media/${media.id}/file`} alt={media.fileName} /> : <div className="media-kind">{t.media.kind[media.kind]}</div>}
      <div className="media-main">
        <div className="media-title">
          <span>{media.fileName}</span>
          <StatusPill status={media.validationStatus} label={statusLabel(t, media.validationStatus)} />
        </div>
        <div className="media-meta">
          <span>{formatBytes(media.sizeBytes)}</span>
          {media.width && media.height ? <span>{`${media.width}x${media.height}`}</span> : null}
          {media.durationSeconds ? <span>{`${media.durationSeconds}s`}</span> : null}
          {media.qualityScore !== null ? <span>{`${t.media.quality} ${Math.round(media.qualityScore * 100)}%`}</span> : null}
        </div>
        {media.validationIssues.length ? <p>{media.validationIssues.join(" ")}</p> : null}
      </div>
    </div>
  );
}

function GenerationPanel({
  detail,
  busy,
  imageConfigured,
  t,
  onGenerateAvatar,
  onBuildAtlas
}: {
  detail: PetDetailResponse;
  busy: string | null;
  imageConfigured: boolean;
  t: I18nMessages;
  onGenerateAvatar: (style: AvatarStyle, sourceMediaId: string, forceRegenerate: boolean) => Promise<void>;
  onBuildAtlas: () => Promise<void>;
}) {
  const imageMedia = detail.media.filter((item) => item.kind === "image" && item.validationStatus !== "rejected");
  const hasAtlas = detail.motionAssets.length > 0;
  const [avatarSourceMediaId, setAvatarSourceMediaId] = useState<string>("");
  const [avatarStyle, setAvatarStyle] = useState<AvatarStyle>("storybook");
  const matchingAvatar = detail.avatarAssets.find(
    (asset) => asset.style === avatarStyle && (!avatarSourceMediaId || asset.sourceMediaId === avatarSourceMediaId)
  );

  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <span className="section-label">{t.generation.title}</span>
          <h3>{t.generation.subtitle}</h3>
        </div>
      </div>

      <div className="virtual-generator">
        <div className="segmented-control">
          {(["storybook", "soft_3d", "pixel", "ink"] as AvatarStyle[]).map((style) => (
            <button key={style} className={avatarStyle === style ? "selected" : ""} type="button" onClick={() => setAvatarStyle(style)}>
              {t.virtualPet.styleLabel[style]}
            </button>
          ))}
        </div>
        <label className="inline-field">
          {t.virtualPet.sourceImage}
          <select value={avatarSourceMediaId} onChange={(event) => setAvatarSourceMediaId(event.target.value)}>
            <option value="">{t.virtualPet.sourceAuto}</option>
            {imageMedia.map((item) => (
              <option key={item.id} value={item.id}>
                {item.fileName}
              </option>
            ))}
          </select>
        </label>
        <button
          className="primary-button"
          type="button"
          disabled={!detail.media.length || !imageConfigured || Boolean(busy)}
          onClick={() => void onGenerateAvatar(avatarStyle, avatarSourceMediaId, Boolean(matchingAvatar))}
        >
          <Sparkles size={16} />
          {imageConfigured ? (matchingAvatar ? t.virtualPet.regenerate : t.virtualPet.generate) : t.generation.providerMissing}
        </button>
      </div>

      <div className="panel-heading legacy-heading">
        <div>
          <span className="section-label">{t.virtualPet.oldAssets}</span>
          <h3>{t.generation.buildAtlas}</h3>
        </div>
        <div className="button-row">
          <button className="secondary-button" onClick={() => void onBuildAtlas()} disabled={!detail.media.length || hasAtlas || Boolean(busy)}>
            <ImagesIcon />
            {hasAtlas ? t.generation.atlasReady : t.generation.buildAtlas}
          </button>
        </div>
      </div>

      <div className="task-list">
        {detail.motionAssets.map((item) => (
          <div className="task-row" key={item.id}>
            <div>
              <div className="task-title">
                <StatusPill status="configured" label={statusLabel(t, "configured")} />
                <span>{t.motionAction[item.action]}</span>
              </div>
              <p>{item.scene}</p>
            </div>
            <a className="secondary-link" href={`/api/motion-assets/${item.id}/file`}>
              WebP
            </a>
          </div>
        ))}
        {!detail.motionAssets.length ? <div className="panel-empty">{t.generation.noTasks}</div> : null}
      </div>
    </section>
  );
}

function InteractionPanel({
  detail,
  busy,
  enabled,
  locale,
  t,
  onPlan,
  onError,
  onPlanResult
}: {
  detail: PetDetailResponse;
  busy: string | null;
  enabled: boolean;
  locale: Locale;
  t: I18nMessages;
  onPlan: (busy: string | null) => void;
  onError: (error: string | null) => void;
  onPlanResult: (plan: PlannerResponse) => void;
}) {
  const [touchZone, setTouchZone] = useState<TouchZone>("none");
  const [message, setMessage] = useState("");
  const [plan, setPlan] = useState<PlannerResponse | null>(null);
  const [provider, setProvider] = useState<"local" | "openai">("local");
  const [useProvider, setUseProvider] = useState(false);
  const zones: TouchZone[] = ["none", "head", "back", "belly", "paw", "tail", "face"];

  return (
    <section className="panel compact-panel">
      <div className="panel-heading">
        <div>
          <span className="section-label">{t.runtime.title}</span>
          <h3>{t.runtime.subtitle}</h3>
        </div>
      </div>
      <div className="zone-row">
        {zones.map((zone) => (
          <button key={zone} className={touchZone === zone ? "zone selected" : "zone"} onClick={() => setTouchZone(zone)}>
            {t.touchZone[zone]}
          </button>
        ))}
      </div>
      <label className="checkbox-row compact-checkbox">
        <input type="checkbox" checked={useProvider} onChange={(event) => setUseProvider(event.target.checked)} />
        <span>{t.runtime.llm}</span>
      </label>
      <form
        className="planner-form"
        onSubmit={(event) => {
          event.preventDefault();
          void runTask(onPlan, onError, "plan", async () => {
            const response = await planInteraction(detail.pet.id, touchZone, message, useProvider, locale);
            setPlan(response.plan);
            setProvider(response.provider);
            onPlanResult(response.plan);
            setMessage("");
          });
        }}
      >
        <input value={message} onChange={(event) => setMessage(event.target.value)} placeholder={t.runtime.inputPlaceholder} maxLength={1000} />
        <button className="icon-button" disabled={!enabled || !message || Boolean(busy)} title={t.runtime.planAction}>
          <Send size={17} />
        </button>
      </form>
      {plan ? (
        <div className="plan-output">
          <div className="task-title">
            <StatusPill status="configured" label={statusLabel(t, "configured")} />
            <span>{`${plan.emotion} · ${provider}`}</span>
          </div>
          <p>{plan.reply}</p>
          {plan.safetyNote ? <p className="safety-note">{plan.safetyNote}</p> : null}
          <ul>
            {plan.actions.map((action, index) => (
              <li key={`${action.type}-${action.name}-${index}`}>{`${action.type}: ${action.name} (${Math.round(action.intensity * 100)}%)`}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

function ImagesIcon() {
  return <FileSearch size={16} />;
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function EmptyState({ t }: { t: I18nMessages }) {
  return (
    <div className="empty-workspace">
      <ShieldCheck size={34} />
      <h2>{t.empty.title}</h2>
      <p>{t.empty.body}</p>
    </div>
  );
}

async function runTask(
  setBusy: (value: string | null) => void,
  setError: (value: string | null) => void,
  label: string,
  task: () => Promise<void>
) {
  setBusy(label);
  setError(null);
  try {
    await task();
  } catch (error) {
    if (error instanceof ApiError) {
      const t = messages[getInitialLocale()];
      setError(`${error.code}: ${t.errors[error.code] ?? error.message}`);
    } else if (error instanceof Error) {
      setError(error.message);
    } else {
      setError(messages[getInitialLocale()].errors.unexpected);
    }
  } finally {
    setBusy(null);
  }
}

function statusLabel(t: I18nMessages, status: StatusKey) {
  return t.status[status] ?? status.replaceAll("_", " ");
}

function formatBytes(bytes: number) {
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value > 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}
