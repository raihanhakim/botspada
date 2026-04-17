export const JADWAL_KULIAH = {
    1: [ // SENIN
        { nama: "Minyak Atsiri", id: "7593", jam: "08:00" },
        { nama: "Protein", id: "7596", jam: "10:00" },
        { nama: "Prinsip Proses", id: "7742", jam: "11:50" }
    ],
    2: [ // SELASA
        { nama: "Metopel", id: "7621", jam: "08:00" },
        { nama: "TPHP", id: "7684", jam: "11:50" }
    ],
    3: [ // RABU
        { nama: "Prak. Prinsip Proses", id: "7742", jam: "10:00" }
    ],
    4: [ // KAMIS
        { nama: "Tek. Pangan", id: "7749", jam: "08:00" },
        { nama: "Lemak & Minyak", id: "7822", jam: "10:00" },
        { nama: "Prak. TPHP", id: "7768", jam: "11:50" }
    ],
    5: [ // JUMAT
        { nama: "Prak. Tek. Pangan", id: "7828", jam: "08:00" },
        { nama: "Kue & Roti", id: "7832", jam: "10:00" }
    ]
};

export function getJadwalHariIni() {
    const hari = new Date().getDay();
    return JADWAL_KULIAH[hari] || [];
}

export function getAllMatkul() {
    let semuaMatkul = [];
    for (let i = 1; i <= 5; i++) {
        if (JADWAL_KULIAH[i]) {
            semuaMatkul = semuaMatkul.concat(JADWAL_KULIAH[i]);
        }
    }
    return [...new Map(semuaMatkul.map(item => [item.id, item])).values()];
}
