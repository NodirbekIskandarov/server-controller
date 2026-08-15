import { useEffect, useState } from "react";
import { useFileListQuery, useFileQuery, useSaveFileMutation } from "../store/api";
import { useAction } from "../components/useAction";
import Confirm from "../components/Confirm";
import {
  Card, Empty, ErrorBox, Loading, Note,
} from "../components/common";
import { bytes, dt } from "../lib/format";

export default function Files() {
  const [dir, setDir] = useState("/opt");
  const [path, setPath] = useState("");
  const [text, setText] = useState("");

  const listing = useFileListQuery(dir);
  const file = useFileQuery(path, { skip: !path });
  const [save] = useSaveFileMutation();
  const { ask, props, result, clearResult } = useAction();

  /**
   * Serverdagi matn kelganda tahrir maydonini to'ldiramiz.
   *
   * `file.data.path` ga bog'langan: aynan shu qiymat fayl almashganda
   * o'zgaradi. Agar `file.data` ga bog'lansa, RTK Query fonda qayta
   * so'rov yuborgan har safar foydalanuvchi yozgan matn o'chib ketardi.
   */
  useEffect(() => {
    if (file.data?.path) setText(file.data.text);
  }, [file.data?.path]);

  const dirty = Boolean(file.data) && text !== file.data.text;

  const open = (entry) => {
    if (entry.dir) {
      setDir(entry.path);
      return;
    }
    setPath(entry.path);
  };

  const askSave = () =>
    ask({
      title: `${file.data.path} saqlanadi`,
      what: "Fayl serverda ustiga yoziladi.",
      consequence:
        "Yozishdan oldin avtomatik zaxira nusxa olinadi " +
        "(<fayl>.bak-<vaqt>) — xato bo'lsa shundan qaytariladi. " +
        "Xizmat sozlamasi o'zgargan bo'lsa, u qayta ishga tushirilmaguncha " +
        "eski sozlama bilan ishlayveradi.",
      command: `cp ${file.data.path} ${file.data.path}.bak-… && saqlash`,
      danger: false,
      confirmLabel: "Saqlansin",
      run: () => save({ yol: file.data.path, matn: text }).unwrap(),
    });

  return (
    <>
      {result && (
        <Note kind="ok" action={<button className="btn sm" onClick={clearResult}>yopish</button>}>
          {result.text}
        </Note>
      )}

      <div className="chips">
        {(listing.data?.roots || []).map((root) => (
          <button
            key={root}
            className={`chip-btn ${dir === root ? "on" : ""}`}
            onClick={() => setDir(root)}
          >
            {root}
          </button>
        ))}
        <span className="spacer" />
        <span className="mono muted" style={{ fontSize: 10.5 }}>{dir}</span>
      </div>

      <div className="split">
        <div className="col">
          <Card
            title={file.data ? file.data.path.split("/").pop() : "Fayl tanlang"}
            sub={file.data ? file.data.path : "chapdagi ro'yxatdan"}
            action={
              file.data && (
                <span className="chips">
                  {dirty && <span className="tag warn">saqlanmagan</span>}
                  <button
                    className="btn sm"
                    disabled={!dirty}
                    onClick={() => setText(file.data.text)}
                  >
                    qaytarish
                  </button>
                  <button className="btn sm pri" disabled={!dirty} onClick={askSave}>
                    saqlash
                  </button>
                </span>
              )
            }
          >
            {!path && (
              <Empty title="Fayl ochilmagan">
                Ruxsat etilgan kataloglar: /opt, /root/projects, /etc/caddy.
                Boshqa yo'llar serverda rad etiladi.
              </Empty>
            )}
            {path && file.isLoading && <Loading label="fayl o'qilmoqda…" />}
            {path && file.error && (
              <div className="pad">
                <ErrorBox error={file.error} onRetry={file.refetch} />
              </div>
            )}
            {file.data && (
              <>
                <textarea
                  className="editor"
                  spellCheck={false}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                />
                <div className="pad axis">
                  <span>
                    {file.data.lines} qator · {bytes(file.data.sizeBytes)} ·
                    o'zgargan {dt(file.data.modifiedAt)}
                  </span>
                  <span>chegara {bytes(file.data.maxBytes)}</span>
                </div>
              </>
            )}
          </Card>
        </div>

        <div className="col">
          <Card title="Katalog" sub={dir}>
            {listing.isLoading && <Loading />}
            {listing.error && (
              <div className="pad">
                <ErrorBox error={listing.error} onRetry={listing.refetch} />
              </div>
            )}
            {listing.data && (
              <div className="tree">
                {listing.data.parent && (
                  <button className="item" onClick={() => setDir(listing.data.parent)}>
                    <span className="ic">..</span>
                    <span className="ellipsis muted">yuqoriga</span>
                    <span className="sz" />
                  </button>
                )}
                {listing.data.entries.map((e) => (
                  <button
                    key={e.path}
                    className={`item ${path === e.path ? "on" : ""}`}
                    // Ikkilik yoki juda katta fayl ochilmaydi — buni
                    // bosishdan oldin ko'rsatgan yaxshi.
                    disabled={!e.dir && !e.editable}
                    title={!e.dir && !e.editable
                      ? "Ikkilik yoki juda katta fayl — panelda ochilmaydi"
                      : e.path}
                    onClick={() => open(e)}
                  >
                    <span className="ic">{e.dir ? "/" : "·"}</span>
                    <span className="ellipsis">{e.name}</span>
                    <span className="sz">{e.dir ? "" : bytes(e.sizeBytes)}</span>
                  </button>
                ))}
                {listing.data.entries.length === 0 && <Empty>Katalog bo'sh.</Empty>}
              </div>
            )}
          </Card>

          <Card className="plain">
            <span className="cap">Qanday ishlaydi</span>
            <p className="desc">
              Yo'l normalizatsiya qilinadi va simvolik havolalar ochiladi —
              <span className="mono"> ..</span> bilan ruxsat etilgan katalogdan
              chiqib bo'lmaydi.
            </p>
            <p className="desc">
              Har saqlashdan oldin zaxira nusxa olinadi. Zaxira olinmasa fayl
              ham yozilmaydi: tiklab bo'lmaydigan tahrir — panel qila oladigan
              eng yomon ish.
            </p>
            <p className="desc">
              Har tahrir audit jurnaliga tushadi: kim, qachon, qaysi fayl,
              hajmi qanday o'zgardi.
            </p>
          </Card>
        </div>
      </div>

      <Confirm {...props} />
    </>
  );
}
