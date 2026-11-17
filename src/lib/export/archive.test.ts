import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { ARCHIVE_FILES, buildDataArchive, dataArchiveName } from "./archive";
import { dataReadme } from "./readme";

describe("buildDataArchive", () => {
  it("zips the three files with their content intact", () => {
    const json = JSON.stringify({ nome: "Conceição", valorCents: 6450 });
    const csv = "Data;Descrição\r\n17/11/2026;Pão de açúcar\r\n";
    const readme = dataReadme("17 de novembro de 2026, 10:32");
    const bytes = buildDataArchive(
      { json, csv, readme },
      new Date("2026-11-17T13:32:00Z"),
    );
    expect(strFromU8(bytes.subarray(0, 2))).toBe("PK");
    const files = unzipSync(bytes);
    expect(Object.keys(files).sort()).toEqual(
      [ARCHIVE_FILES.csv, ARCHIVE_FILES.readme, ARCHIVE_FILES.json].sort(),
    );
    expect(strFromU8(files[ARCHIVE_FILES.json] as Uint8Array)).toBe(json);
    expect(strFromU8(files[ARCHIVE_FILES.csv] as Uint8Array)).toBe(csv);
    expect(strFromU8(files[ARCHIVE_FILES.readme] as Uint8Array)).toBe(readme);
  });

  it("names the file by the day", () => {
    expect(dataArchiveName("2026-11-17")).toBe("prumo-dados-2026-11-17.zip");
  });
});

describe("dataReadme", () => {
  it("says when, what each file holds and what is left out", () => {
    const text = dataReadme("17 de novembro de 2026, 10:32");
    expect(text).toContain("gerada em 17 de novembro de 2026, 10:32");
    expect(text).toContain("prumo-dados.json");
    expect(text).toContain("6450 = R$ 64,50");
    expect(text).toContain("Senhas, passkeys e tokens de acesso não vão");
    expect(text).toContain("“access”");
    expect(text).toContain("“sharing”");
  });
});
