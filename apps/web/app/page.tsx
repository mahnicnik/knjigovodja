
import Link from 'next/link'

export default function LandingPage() {
  return (
    <>
   <style>{`
  html{scroll-behavior:smooth}
  *{box-sizing:border-box;margin:0;padding:0}
  

        *{box-sizing:border-box;margin:0;padding:0}
        .lp{background:#fff;color:#111;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}
        .nav{display:flex;align-items:center;justify-content:space-between;padding:0 40px;height:56px;border-bottom:0.5px solid #EBEBEB;background:#fff;position:sticky;top:0;z-index:99}
        .nlogo{display:flex;align-items:center;gap:10px}
        .nmark{width:30px;height:30px;border-radius:8px;background:#0A3D2B;display:flex;align-items:center;justify-content:center;color:#9FE1CB;font-size:11px;font-weight:500}
        .nname{font-size:14px;font-weight:500;color:#111}
        .nr{display:flex;align-items:center;gap:8px}
        .nlnk{padding:5px 10px;border-radius:6px;font-size:12px;color:#666;text-decoration:none}
        .nlnk:hover{background:#F5F5F5}
        .nbtn{padding:6px 14px;border-radius:7px;font-size:12px;border:0.5px solid #DDD;background:#fff;color:#111;cursor:pointer;text-decoration:none;display:inline-block}
        .ndark{padding:7px 16px;border-radius:7px;font-size:12px;font-weight:500;background:#0A3D2B;color:#fff;border:none;cursor:pointer;text-decoration:none;display:inline-block}
        .hero{padding:72px 40px 64px;background:#fff;text-align:center}
        .hero-eyebrow{display:inline-flex;align-items:center;gap:6px;padding:5px 14px;border-radius:20px;background:#E8F5EE;color:#085041;font-size:11px;font-weight:500;border:0.5px solid #C5E8D5;margin-bottom:22px}
        .hero-h1{font-size:45px;font-weight:600;line-height:1.12;letter-spacing:-1px;color:#0A0A0A;margin-bottom:18px;max-width:660px;margin-left:auto;margin-right:auto}
        .grn{color:#1D9E75}.red{color:#D14040}
        .hero-sub{font-size:17px;color:#444;line-height:1.7;max-width:480px;margin:0 auto 32px}
        .hero-cta{display:flex;align-items:center;justify-content:center;gap:10px;margin-bottom:14px}
        .btn-primary{padding:13px 30px;border-radius:9px;font-size:14px;font-weight:500;background:#1D9E75;color:#fff;border:none;cursor:pointer;text-decoration:none;display:inline-block}
        .btn-secondary{padding:13px 22px;border-radius:9px;font-size:14px;color:#555;border:0.5px solid #DDD;background:#fff;cursor:pointer;text-decoration:none;display:inline-block}
        .hero-trust{display:flex;align-items:center;justify-content:center;gap:20px;flex-wrap:wrap}
        .ti-item{display:flex;align-items:center;gap:5px;font-size:11px;color:#999}
        .pain{background:#FFF8F0;border-top:0.5px solid #F0E0C8;border-bottom:0.5px solid #F0E0C8;padding:22px 40px;text-align:center}
        .pain-q{font-size:17px;color:#333;line-height:1.5;margin-bottom:6px;font-style:italic;max-width:660px;margin-left:auto;margin-right:auto}
        .pain-attr{font-size:11px;color:#aaa}
        .math{padding:60px 40px;background:#FAFAFA}
        .math-head{text-align:center;margin-bottom:40px}
        .sec-tag{display:inline-block;padding:4px 12px;border-radius:20px;font-size:11px;font-weight:500;margin-bottom:12px}
        .sec-h{font-size:27px;font-weight:600;letter-spacing:-.5px;color:#111;margin-bottom:8px}
        .sec-sub{font-size:13px;color:#666;line-height:1.6}
        .math-eq{display:grid;grid-template-columns:1fr auto 1fr auto 1fr;align-items:center;gap:0;max-width:720px;margin:0 auto}
        .mc{background:#fff;border:0.5px solid #E8E8E8;border-radius:12px;padding:22px;text-align:center}
        .mc.bad{border-color:#F0C8C8;background:#FFFAFA}
        .mc.good{background:#0A3D2B;border-color:#0A3D2B}
        .mlbl{font-size:11px;color:#999;margin-bottom:7px}
        .mval{font-size:30px;font-weight:500;letter-spacing:-.6px;color:#111}
        .mval.r{color:#D14040}.mval.g{color:#1D9E75}
        .mdesc{font-size:11px;color:#aaa;margin-top:5px;line-height:1.5}
        .mop{font-size:22px;color:#CCC;padding:0 14px;text-align:center}
        .mc.good .mlbl{color:rgba(255,255,255,.4)}
        .mc.good .mval{color:#9FE1CB}
        .mc.good .mdesc{color:rgba(255,255,255,.3)}
        .mc.good .mdesc b{color:#9FE1CB}
        .product{padding:60px 40px;background:#fff}
        .prod-head{text-align:center;max-width:520px;margin:0 auto 36px}
        .app-frame{max-width:800px;margin:0 auto;border:0.5px solid #E0E0E0;border-radius:14px;overflow:hidden}
        .app-topbar{background:#0A3D2B;padding:10px 16px;display:flex;align-items:center;gap:8px}
        .d{width:10px;height:10px;border-radius:50%}
        .app-url{flex:1;background:rgba(255,255,255,.08);border-radius:5px;padding:3px 0;text-align:center;font-size:11px;color:rgba(255,255,255,.3)}
        .app-body{display:grid;grid-template-columns:180px 1fr;min-height:300px}
        .sb{background:#0A3D2B;padding:14px 8px;display:flex;flex-direction:column}
        .sb-logo{color:#fff;font-size:12px;font-weight:500;padding:0 8px;margin-bottom:14px}
        .sb-sec{font-size:9px;color:rgba(255,255,255,.2);letter-spacing:.1em;padding:0 8px;margin:8px 0 4px}
        .sbi{display:flex;align-items:center;gap:7px;padding:6px 8px;border-radius:7px;font-size:11px;color:rgba(255,255,255,.45);margin-bottom:1px}
        .sbi.on{background:rgba(255,255,255,.12);color:#fff}
        .sb-foot{margin-top:auto;border-top:0.5px solid rgba(255,255,255,.08);padding-top:10px}
        .urow{display:flex;align-items:center;gap:8px;padding:6px 8px}
        .uav{width:26px;height:26px;border-radius:50%;background:#1D9E75;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:500;color:#fff;flex-shrink:0}
        .uname{font-size:11px;color:rgba(255,255,255,.65)}
        .utype{font-size:9px;color:rgba(255,255,255,.3)}
        .main-area{display:flex;flex-direction:column;background:#F7F7F5}
        .main-top{display:flex;align-items:center;justify-content:space-between;padding:13px 16px;background:#fff;border-bottom:0.5px solid #EBEBEB;flex-wrap:wrap;gap:8px}
        .mtg{font-size:13px;font-weight:500;color:#111}
        .mtd{font-size:10px;color:#999;margin-top:1px}
        .mt-pills{display:flex;gap:6px;flex-wrap:wrap}
        .mt-pill{padding:4px 10px;border-radius:6px;font-size:10px;font-weight:500}
        .mt-pill.red{background:#FDEAEA;color:#C0392B}
        .mt-pill.amber{background:#FEF3E2;color:#9A6315}
        .kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:7px;padding:12px}
        .kpi{background:#fff;border:0.5px solid #EBEBEB;border-radius:9px;padding:10px 12px}
        .kpi.dk{background:#0A3D2B;border:none}
        .kl{font-size:9px;color:#999;margin-bottom:4px}
        .kv{font-size:17px;font-weight:500;letter-spacing:-.4px;color:#111}
        .amid{display:grid;grid-template-columns:1fr 1fr;gap:7px;padding:0 12px 12px}
        .acard{background:#fff;border:0.5px solid #EBEBEB;border-radius:9px;padding:10px 12px}
        .act{font-size:10px;font-weight:500;color:#111;margin-bottom:7px;display:flex;justify-content:space-between}
        .act a{font-size:9px;color:#1D9E75;cursor:pointer}
        .irow{display:flex;align-items:center;gap:5px;padding:4px 0;border-bottom:0.5px solid #F0F0F0;font-size:10px}
        .irow:last-child{border:none}
        .idot{width:5px;height:5px;border-radius:50%;flex-shrink:0}
        .irn{flex:1;font-weight:500;color:#111}
        .ira{font-weight:500;color:#111;margin-left:auto}
        .ibdg{font-size:8px;font-weight:500;padding:1px 5px;border-radius:5px;margin-left:3px}
        .drow{display:flex;align-items:center;gap:5px;padding:5px 0;border-bottom:0.5px solid #F0F0F0;font-size:10px}
        .drow:last-child{border:none}
        .dname{flex:1;color:#333}
        .ddys{font-size:9px;font-weight:500;padding:2px 7px;border-radius:5px;margin-left:auto}
        .aab{background:#fff;border-top:0.5px solid #EBEBEB;padding:8px 12px;display:flex;align-items:center;gap:6px;flex-wrap:wrap}
        .aabl{font-size:9px;color:#bbb}
        .aabt{display:flex;align-items:center;gap:4px;padding:4px 8px;border-radius:6px;font-size:10px;border:0.5px solid #E0E0E0;background:#fff;color:#555;cursor:pointer}
        .aabm{margin-left:auto;display:flex;align-items:center;gap:4px;padding:5px 12px;border-radius:6px;font-size:10px;font-weight:500;background:#0A3D2B;color:#fff;cursor:pointer}
        .feats{padding:60px 40px;background:#FAFAFA}
        .feat-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;max-width:720px;margin:0 auto}
        .feat{display:flex;gap:14px;background:#fff;border:0.5px solid #EBEBEB;border-radius:11px;padding:18px}
        .fic{width:36px;height:36px;border-radius:9px;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:2px}
        .ft{font-size:13px;font-weight:500;color:#111;margin-bottom:5px}
        .fs{font-size:12px;color:#666;line-height:1.65}
        .fnew{font-size:9px;font-weight:500;padding:2px 7px;border-radius:8px;background:#E8F5EE;color:#085041;display:inline-block;margin-top:5px}
        .compare{padding:60px 40px;background:#fff}
        .cmp-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;max-width:680px;margin:0 auto}
        .cmp-col{border-radius:12px;overflow:hidden;border:0.5px solid #EBEBEB}
        .cmp-col.winner{border:2px solid #1D9E75}
        .cmp-head-r{padding:14px 18px;display:flex;align-items:center;gap:8px;font-size:12px;font-weight:500}
        .cmp-row{display:flex;align-items:flex-start;gap:10px;padding:11px 18px;border-top:0.5px solid #F0F0F0;background:#fff}
        .cic{font-size:14px;flex-shrink:0;margin-top:1px}
        .ct{font-size:12px;color:#666;line-height:1.5}
        .ct b{color:#111;font-weight:500}
        .social{padding:60px 40px;background:#FAFAFA}
        .testis{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;max-width:780px;margin:0 auto}
        .testi{background:#fff;border:0.5px solid #EBEBEB;border-radius:12px;padding:18px;position:relative}
        .tbdg{position:absolute;top:14px;right:14px;font-size:10px;font-weight:500;padding:2px 8px;border-radius:8px;background:#E8F5EE;color:#085041}
        .tstr{color:#EF9F27;font-size:12px;margin-bottom:10px}
        .ttext{font-size:12px;color:#555;line-height:1.65;margin-bottom:14px;font-style:italic}
        .tauth{display:flex;align-items:center;gap:8px}
        .tav{width:28px;height:28px;border-radius:50%;background:#E8F5EE;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:500;color:#085041;flex-shrink:0}
        .tname{font-size:12px;font-weight:500;color:#111}
        .trole{font-size:10px;color:#aaa}
        .pricing{padding:60px 40px;background:#fff}
        .plans{display:grid;grid-template-columns:1fr 1fr;gap:14px;max-width:560px;margin:0 auto}
        .plan{background:#fff;border:0.5px solid #EBEBEB;border-radius:12px;padding:22px}
        .plan.hot{border:2px solid #1D9E75;background:#FCFFFE}
        .pbdg{display:inline-block;padding:3px 10px;border-radius:8px;font-size:10px;font-weight:500;background:#E8F5EE;color:#085041;margin-bottom:14px}
        .pname{font-size:13px;font-weight:500;color:#666;margin-bottom:4px}
        .pprice{font-size:30px;font-weight:500;letter-spacing:-.6px;color:#111}
        .pprice span{font-size:12px;color:#aaa;font-weight:400}
        .psave{font-size:10px;font-weight:500;padding:2px 8px;border-radius:8px;background:#E8F5EE;color:#085041;display:inline-block;margin-bottom:14px}
        .pf{display:flex;align-items:center;gap:7px;font-size:12px;color:#555;margin-bottom:7px}
        .pbtn{width:100%;margin-top:16px;padding:10px;border-radius:8px;font-size:13px;font-weight:500;cursor:pointer;border:none;text-align:center;display:block;text-decoration:none}
        .pbtn.lt{background:#F5F5F5;color:#333}
        .pbtn.grn{background:#1D9E75;color:#fff}
        .faq{padding:60px 40px;background:#FAFAFA}
        .faq-list{max-width:600px;margin:0 auto}
        .faq-item{border-bottom:0.5px solid #EBEBEB;padding:16px 0}
        .faq-item:last-child{border:none}
        .faq-q{font-size:13px;font-weight:500;color:#111;margin-bottom:7px}
        .faq-a{font-size:12px;color:#666;line-height:1.7}
        .cta{padding:72px 40px;text-align:center;background:#0A3D2B}
        .cta-eye{font-size:11px;color:#9FE1CB;font-weight:500;letter-spacing:.06em;margin-bottom:14px;opacity:.7}
        .cta-h{font-size:34px;font-weight:500;color:#fff;letter-spacing:-.7px;margin-bottom:10px;line-height:1.15}
        .cta-s{font-size:14px;color:rgba(255,255,255,.5);margin-bottom:28px;max-width:400px;margin-left:auto;margin-right:auto;line-height:1.7}
        .btn-cta{padding:14px 34px;border-radius:9px;font-size:14px;font-weight:500;background:#1D9E75;color:#fff;border:none;cursor:pointer;text-decoration:none;display:inline-block}
        .cta-n{font-size:11px;color:rgba(255,255,255,.25);margin-top:14px}
        .foot{padding:22px 40px;border-top:0.5px solid #EBEBEB;background:#fff;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px}
        .flogo{font-size:12px;font-weight:500;color:#333}
        .flinks{display:flex;gap:18px}
        .flink{font-size:11px;color:#aaa;text-decoration:none}
        .fcopy{font-size:11px;color:#aaa}
        .divider{border:none;border-top:0.5px solid #EBEBEB}
        @media(max-width:768px){
  .nav{padding:0 16px}.hero{padding:48px 16px 40px}.hero-h1{font-size:30px}
  .math-eq{grid-template-columns:1fr;gap:8px}.mop{padding:4px 0;font-size:16px}
  .app-body{grid-template-columns:1fr}.sb{display:none}
  .kpis{grid-template-columns:1fr 1fr}.amid{grid-template-columns:1fr}
  .feat-grid{grid-template-columns:1fr}.cmp-grid{grid-template-columns:1fr}
  .testis{grid-template-columns:1fr}.plans{grid-template-columns:1fr}
  .math{padding:40px 16px}.product{padding:40px 16px}.feats{padding:40px 16px}
  .compare{padding:40px 16px}.social{padding:40px 16px}.pricing{padding:40px 16px}
  .faq{padding:40px 16px}.cta{padding:48px 16px}.foot{padding:20px 16px}
  .pain{padding:18px 16px}.hero-trust{gap:12px}
  .nr .nlnk{display:none}
  .nbtn{display:inline-block!important}
  .hero-cta{flex-direction:column;gap:8px}
  .btn-primary{width:100%;text-align:center;box-sizing:border-box}
  .btn-secondary{display:none}
  .nav .nbtn{display:none}
}
      `}</style>
      <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@latest/dist/tabler-icons.min.css" />

      <div className="lp">

        <nav className="nav">
          <div className="nlogo">
            <div className="nmark">rč</div>
            <span className="nname">Računko</span>
          </div>
          <div className="nr">
          <a href="#kako-deluje" className="nlnk">Kako deluje</a>
<a href="#primerjava" className="nlnk">Primerjava</a>
<a href="#cene" className="nlnk">Cene</a>
            <Link href="/login" className="nbtn">Prijava</Link>
            <Link href="/register" className="ndark">Začni brezplačno →</Link>
          </div>
        </nav>

        <div className="hero">
          <div className="hero-eyebrow"><i className="ti ti-map-pin"></i> Narejeno za slovenskega s.p. in d.o.o.</div>
          <h1 className="hero-h1">Vaš računovodja naredi <span className="red">10 klikov</span> na mesec.<br/>Vi plačate <span className="red">€300.</span></h1>
          <p className="hero-sub">Računko je AI računovodja ki pozna slovensko davčno pravo, vaše podatke in FURS roke. Enako delo. Ena devetnajstina cene.</p>
          <div className="hero-cta">
            <Link href="/register" className="btn-primary">Preizkusi brezplačno — danes →</Link>
            <Link href="/login" className="btn-secondary">Prijava</Link>
          </div>
          <div className="hero-trust">
            <div className="ti-item"><i className="ti ti-shield-check" style={{color:'#1D9E75'}}></i> Brez kreditne kartice</div>
            <div className="ti-item"><i className="ti ti-database" style={{color:'#1D9E75'}}></i> Podatki v EU</div>
            <div className="ti-item"><i className="ti ti-clock" style={{color:'#1D9E75'}}></i> Nastavitev v 5 minutah</div>
            <div className="ti-item"><i className="ti ti-x" style={{color:'#1D9E75'}}></i> Brez vezave</div>
          </div>
        </div>

        <div className="pain">
          <p className="pain-q">"Vsak mesec pošljem računovodji iste dokumente. On mi pošlje <span className="red">isti email z zneski prispevkov.</span> Račun: €320."</p>
          <div className="pain-attr">— resnična izkušnja slovenskega s.p. freelancerja</div>
        </div>

        <div className="math">
          <div className="math-head">
            <div className="sec-tag" style={{background:'#FDEAEA',color:'#C0392B'}}>Preprosta matematika</div>
            <div className="sec-h">Koliko vas dejansko stane ta "storitev"?</div>
            <p className="sec-sub">Seštejte mesečne račune in se vprašajte: kaj sem dobil za to?</p>
          </div>
          <div className="math-eq">
            <div className="mc bad">
              <div className="mlbl">Povprečni računovodja za s.p.</div>
              <div className="mval r">€300<span style={{fontSize:'13px',color:'#ccc'}}>/mes</span></div>
              <div className="mdesc">Opomnik enkrat mesečno + PDF ob koncu leta</div>
            </div>
            <div className="mop">×</div>
            <div className="mc">
              <div className="mlbl">Mesecev v letu</div>
              <div className="mval">12</div>
              <div className="mdesc">Vsak mesec, brez izjeme</div>
            </div>
            <div className="mop">=</div>
            <div className="mc good">
              <div className="mlbl">Letni strošek</div>
              <div className="mval">€3.600</div>
              <div className="mdesc">Za storitev ki jo Računko naredi za <b>€228/leto</b></div>
            </div>
          </div>
        </div>

        <div className="product">
          <div className="prod-head">
            <div className="sec-tag" style={{background:'#E8F5EE',color:'#085041'}}>Videz aplikacije</div>
            <div className="sec-h">Vse kar potrebujete. Na enem zaslonu.</div>
            <p className="sec-sub">Prihodki, roki, računi in AI računovodja — brez iskanja dokumentov, brez čakanja na email.</p>
          </div>
          <div className="app-frame">
            <div className="app-topbar">
              <div className="d" style={{background:'#E24B4A'}}></div>
              <div className="d" style={{background:'#EF9F27'}}></div>
              <div className="d" style={{background:'#1D9E75'}}></div>
              <div className="app-url">racunko.si/dashboard</div>
            </div>
            <div className="app-body">
              <div className="sb">
                <div className="sb-logo">Računko</div>
                <div className="sb-sec">Pregled</div>
                <div className="sbi on"><i className="ti ti-layout-dashboard"></i> Dashboard</div>
                <div className="sbi"><i className="ti ti-robot"></i> AI računovodja</div>
                <div className="sbi"><i className="ti ti-chart-bar"></i> Statistika</div>
                <div className="sb-sec">Poslovanje</div>
                <div className="sbi"><i className="ti ti-file-invoice"></i> Računi</div>
                <div className="sbi"><i className="ti ti-receipt"></i> Stroški</div>
                <div className="sb-sec">Davki</div>
                <div className="sbi"><i className="ti ti-qrcode"></i> Prispevki QR</div>
                <div className="sbi"><i className="ti ti-percentage"></i> DDV obračun</div>
                <div className="sbi"><i className="ti ti-calculator"></i> Normirani</div>
                <div className="sb-foot">
                  <div className="urow">
                    <div className="uav">RS</div>
                    <div><div className="uname">Računko s.p.</div><div className="utype">Normiranec · brez DDV</div></div>
                  </div>
                </div>
              </div>
              <div className="main-area">
                <div className="main-top">
                  <div><div className="mtg">Dober dan 👋</div><div className="mtd">Petek, 9. maj 2026 · maj 2026</div></div>
                  <div className="mt-pills">
                    <div className="mt-pill red"><i className="ti ti-alert-circle" style={{fontSize:'10px'}}></i> 1 račun v zamudi</div>
                    <div className="mt-pill amber"><i className="ti ti-clock" style={{fontSize:'10px'}}></i> Prispevki čez 6 dni</div>
                  </div>
                </div>
                <div className="kpis">
                  <div className="kpi"><div className="kl">Prihodki maj</div><div className="kv" style={{color:'#085041'}}>€2.840</div></div>
                  <div className="kpi"><div className="kl">Odhodki</div><div className="kv" style={{color:'#C0392B'}}>€640</div></div>
                  <div className="kpi dk"><div className="kl" style={{color:'rgba(255,255,255,.4)'}}>Neplačano</div><div className="kv" style={{color:'#9FE1CB'}}>€1.200</div></div>
                  <div className="kpi"><div className="kl">Dobiček</div><div className="kv">€2.200</div></div>
                </div>
                <div className="amid">
                  <div className="acard">
                    <div className="act">Zadnji računi <a>vsi →</a></div>
                    <div className="irow"><div className="idot" style={{background:'#1D9E75'}}></div><div className="irn">Agencija Pixel d.o.o.</div><div className="ira">€1.200</div><div className="ibdg" style={{background:'#E8F5EE',color:'#085041'}}>Plačano</div></div>
                    <div className="irow"><div className="idot" style={{background:'#EF9F27'}}></div><div className="irn">Startup XY d.o.o.</div><div className="ira">€850</div><div className="ibdg" style={{background:'#FEF3E2',color:'#9A6315'}}>Poslano</div></div>
                    <div className="irow"><div className="idot" style={{background:'#E24B4A'}}></div><div className="irn">Tech Solutions</div><div className="ira">€350</div><div className="ibdg" style={{background:'#FDEAEA',color:'#C0392B'}}>Zamuda</div></div>
                  </div>
                  <div className="acard">
                    <div className="act">Roki ta mesec</div>
                    <div className="drow"><div className="dname">Prispevki s.p. — €522</div><div className="ddys" style={{background:'#FEF3E2',color:'#9A6315'}}>6 dni</div></div>
                    <div className="drow"><div className="dname">Akontacija — €113</div><div className="ddys" style={{background:'#FEF3E2',color:'#9A6315'}}>6 dni</div></div>
                    <div className="drow"><div className="dname">REK-1 + plača</div><div className="ddys" style={{background:'#E8F5EE',color:'#085041'}}>17 dni</div></div>
                  </div>
                </div>
                <div className="aab">
                  <span className="aabl">Hitro:</span>
                  <div className="aabt"><i className="ti ti-scan"></i> Skeniraj</div>
                  <div className="aabt"><i className="ti ti-qrcode"></i> Prispevki QR</div>
                  <div className="aabt"><i className="ti ti-robot"></i> AI</div>
                  <div className="aabm"><i className="ti ti-file-plus"></i> Nov račun</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <hr className="divider" />

        <div className="feats" id="kako-deluje">
          <div className="math-head">
            <div className="sec-tag" style={{background:'#E8F5EE',color:'#085041'}}>Kaj dobite</div>
            <div className="sec-h">Vse kar računovodja počne. Plus tisto kar ne.</div>
            <p className="sec-sub">Računovodja vam ne more odgovoriti ob 22:00. Računko odgovori v 3 sekundah.</p>
          </div>
          <div className="feat-grid">
            <div className="feat"><div className="fic" style={{background:'#EEEDFE'}}><i className="ti ti-robot" style={{fontSize:'17px',color:'#534AB7'}}></i></div><div><div className="ft">AI ki pozna vaše podatke</div><div className="fs">"Koliko dohodnine bom plačal letos?" — odgovor z vašim dejanskim prometom v 3 sekundah. Vaš računovodja čaka 3 dni.</div><div className="fnew">24/7 na voljo</div></div></div>
            <div className="feat"><div className="fic" style={{background:'#FEF3E2'}}><i className="ti ti-qrcode" style={{fontSize:'17px',color:'#9A6315'}}></i></div><div><div className="ft">Prispevki QR — 30 sekund</div><div className="fs">ZPIZ + ZZZS + akontacija z UPN QR kodo. Skenira banka, plačilo narejeno. Brez ročnega izpolnjevanja nalogov.</div><div className="fnew">Samo za SLO trg</div></div></div>
            <div className="feat"><div className="fic" style={{background:'#FDEAEA'}}><i className="ti ti-bell" style={{fontSize:'17px',color:'#C0392B'}}></i></div><div><div className="ft">Opomniki 7 dni vnaprej</div><div className="fs">Ne en dan prej — 7 dni vnaprej za vsak davčni rok. Prispevki, DDV-O, akontacija, REK-1. Nikoli prepozno.</div></div></div>
            <div className="feat"><div className="fic" style={{background:'#E6F1FB'}}><i className="ti ti-file-invoice" style={{fontSize:'17px',color:'#185FA5'}}></i></div><div><div className="ft">Računi z UPN QR v 30 sec</div><div className="fs">PDF z UPN QR kodo. Stranka skenira z mobilno banko, plačilo pride direktno. Brez čakanja na računovodjo.</div></div></div>
            <div className="feat"><div className="fic" style={{background:'#E8F5EE'}}><i className="ti ti-scan" style={{fontSize:'17px',color:'#0F6E56'}}></i></div><div><div className="ft">Skeniraj strošek — AI OCR</div><div className="fs">Fotografirajte račun, AI prepozna vse podatke. Konec zbiranja in pošiljanja dokumentov računovodji vsak mesec.</div></div></div>
            <div className="feat"><div className="fic" style={{background:'#EAF3DE'}}><i className="ti ti-calculator" style={{fontSize:'17px',color:'#3B6D11'}}></i></div><div><div className="ft">Normirani vs. dejanski</div><div className="fs">Točen izračun kdaj se vam splača preiti. Vaš računovodja vam tega verjetno nikoli ni pokazal.</div><div className="fnew">Unikatno za SLO</div></div></div>
          </div>
        </div>

        <div className="compare" id="primerjava">
          <div className="math-head">
            <div className="sec-tag" style={{background:'#FEF3E2',color:'#9A6315'}}>Poštena primerjava</div>
            <div className="sec-h">Računovodja vs. Računko</div>
            <p className="sec-sub">Za s.p. ki večino dela opravljajo sami.</p>
          </div>
          <div className="cmp-grid">
            <div className="cmp-col">
              <div className="cmp-head-r" style={{background:'#FDEAEA',color:'#C0392B'}}><i className="ti ti-user"></i> Računovodja · €200–500/mes</div>
              <div className="cmp-row"><span className="cic" style={{color:'#E24B4A'}}><i className="ti ti-x"></i></span><div className="ct">Splošni odgovori brez vpogleda v vaše podatke</div></div>
              <div className="cmp-row"><span className="cic" style={{color:'#E24B4A'}}><i className="ti ti-x"></i></span><div className="ct">Odgovor čez 1–3 dni. Ob 22h — jutri.</div></div>
              <div className="cmp-row"><span className="cic" style={{color:'#E24B4A'}}><i className="ti ti-x"></i></span><div className="ct">Vi zbirate in pošiljate dokumente vsak mesec</div></div>
              <div className="cmp-row"><span className="cic" style={{color:'#E24B4A'}}><i className="ti ti-x"></i></span><div className="ct">Opomnik en dan prej — pogosto prepozno</div></div>
              <div className="cmp-row"><span className="cic" style={{color:'#EF9F27'}}><i className="ti ti-minus"></i></span><div className="ct">Koristen za revizije in d.o.o. nad 50k</div></div>
            </div>
            <div className="cmp-col winner">
              <div className="cmp-head-r" style={{background:'#E8F5EE',color:'#085041'}}><i className="ti ti-robot"></i> Računko · €19/mes</div>
              <div className="cmp-row"><span className="cic" style={{color:'#1D9E75'}}><i className="ti ti-check"></i></span><div className="ct"><b>Konkretni odgovori</b> z vašimi dejanskimi podatki</div></div>
              <div className="cmp-row"><span className="cic" style={{color:'#1D9E75'}}><i className="ti ti-check"></i></span><div className="ct"><b>Takoj. 24/7.</b> Tudi ob nedeljah in praznikih.</div></div>
              <div className="cmp-row"><span className="cic" style={{color:'#1D9E75'}}><i className="ti ti-check"></i></span><div className="ct">AI OCR skeniranje — <b>konec zbiranja papirjev</b></div></div>
              <div className="cmp-row"><span className="cic" style={{color:'#1D9E75'}}><i className="ti ti-check"></i></span><div className="ct"><b>7 dni vnaprej</b> za vsak davčni rok</div></div>
              <div className="cmp-row"><span className="cic" style={{color:'#EF9F27'}}><i className="ti ti-minus"></i></span><div className="ct">Za revizije priporočamo računovodja — <b>Računko pokrije 95%</b></div></div>
            </div>
          </div>
        </div>

        <div className="social">
          <div className="math-head">
            <div className="sec-tag" style={{background:'#E8F5EE',color:'#085041'}}>Resnične izkušnje</div>
            <div className="sec-h">S.p. ki so preračunali</div>
            <p className="sec-sub">Ne splošne pohvale — konkretni zneski ki so jih prihranili.</p>
          </div>
          <div className="testis">
            <div className="testi"><div className="tbdg">Prihranek €3.120/leto</div><div className="tstr">★★★★★</div><p className="ttext">"Plačevala sem €280/mes. Dobivala sem isti email z zneski prispevkov. Zdaj to naredi Računko sam — imam €260 več vsak mesec."</p><div className="tauth"><div className="tav">AK</div><div><div className="tname">Ana K.</div><div className="trole">IT freelancer · Ljubljana</div></div></div></div>
            <div className="testi"><div className="tbdg">Brez zamujenih rokov</div><div className="tstr">★★★★★</div><p className="ttext">"Imel sem strah da bom brez računovodje naredil napako. Po 8 mesecih — nobene napake, vsi roki spoštovani, FURS ne javi."</p><div className="tauth"><div className="tav">MT</div><div><div className="tname">Miha T.</div><div className="trole">Grafični oblikovalec · Maribor</div></div></div></div>
            <div className="testi"><div className="tbdg">Prihranek €4.572/leto</div><div className="tstr">★★★★★</div><p className="ttext">"AI mi je odgovoril v 10 sekundah na vprašanje ki sem ga poslala računovodji ob torku. Odgovor sem dobila v petek. Za €380/mes."</p><div className="tauth"><div className="tav">SP</div><div><div className="tname">Sara P.</div><div className="trole">Fizioterapevtka · Kranj</div></div></div></div>
          </div>
        </div>

        <div className="pricing" id="cene">
          <div className="math-head">
            <div className="sec-tag" style={{background:'#FEF3E2',color:'#9A6315'}}>Cene</div>
            <div className="sec-h">Fiksno. Brez presenečenj.</div>
            <p className="sec-sub">Nobenega "minimuma ur", nobenega "letnega obračuna posebej".</p>
          </div>
          <div className="plans">
            <div className="plan">
              <div className="pname">Starter</div>
              <div className="pprice">€0 <span>/ mesec</span></div>
              <div className="psave">Brez kreditne kartice</div>
              <div className="pf"><i className="ti ti-check" style={{color:'#1D9E75'}}></i> 5 računov mesečno</div>
              <div className="pf"><i className="ti ti-check" style={{color:'#1D9E75'}}></i> AI računovodja (10 vprašanj)</div>
              <div className="pf"><i className="ti ti-check" style={{color:'#1D9E75'}}></i> Prispevki QR</div>
              <div className="pf"><i className="ti ti-check" style={{color:'#1D9E75'}}></i> Davčni rokovnik</div>
              <Link href="/register" className="pbtn lt">Začni brezplačno</Link>
            </div>
            <div className="plan hot">
              <div className="pbdg">Zamenja računovodja</div>
              <div className="pname">Pro</div>
              <div className="pprice">€19 <span>/ mesec</span></div>
              <div className="psave">Prihranite do €5.000/leto</div>
              <div className="pf"><i className="ti ti-check" style={{color:'#1D9E75'}}></i> Neomejeni računi</div>
              <div className="pf"><i className="ti ti-check" style={{color:'#1D9E75'}}></i> AI brez omejitev · 24/7</div>
              <div className="pf"><i className="ti ti-check" style={{color:'#1D9E75'}}></i> OCR skeniranje stroškov</div>
              <div className="pf"><i className="ti ti-check" style={{color:'#1D9E75'}}></i> Obračun plač + regres</div>
              <div className="pf"><i className="ti ti-check" style={{color:'#1D9E75'}}></i> DDV evidenca</div>
              <div className="pf"><i className="ti ti-check" style={{color:'#1D9E75'}}></i> Stripe integracija</div>
              <Link href="/register" className="pbtn grn">Začni Pro — €19/mes →</Link>
            </div>
          </div>
        </div>

        <div className="faq">
          <div className="math-head">
            <div className="sec-tag" style={{background:'#F5F5F5',color:'#666'}}>Pogosta vprašanja</div>
            <div className="sec-h">Odgovori brez zavijanja</div>
          </div>
          <div className="faq-list">
            <div className="faq-item"><div className="faq-q">Ali Računko res nadomesti računovodja?</div><div className="faq-a">Za 90% samostojnih podjetnikov — da. Normiranec, DDV zavezanec, par zaposlenih — Računko pokrije vse. Za d.o.o. z revizijo priporočamo Računko + računovodja za letni zaključek.</div></div>
            <div className="faq-item"><div className="faq-q">Kaj pa če naredim napako?</div><div className="faq-a">Računko vas opomni 7 dni pred rokom. AI vas opozori na napake pri vnosu. Mesečni vodič vas korak za korakom pelje skozi vse obveznosti za vaš profil.</div></div>
            <div className="faq-item"><div className="faq-q">Ali moram prekiniti pogodbo z računovodjem preden se prijavim?</div><div className="faq-a">Ne. Preizkusite Računko mesec brezplačno, šele nato se odločite. Večina strank odpove pogodbo po prvem mesecu ko vidijo da res deluje.</div></div>
            <div className="faq-item"><div className="faq-q">Deluje za DDV zavezance?</div><div className="faq-a">Da. DDV evidenca, izračun dolga, opomniki za DDV-O rok — vse je vključeno v Pro planu.</div></div>
            <div className="faq-item"><div className="faq-q">Kako varni so moji finančni podatki?</div><div className="faq-a">Strežniki v EU, Supabase platforma, Row Level Security — tehnično je nemogoče da bi drug uporabnik videl vaše podatke.</div></div>
          </div>
        </div>

        <div className="cta">
          <div className="cta-eye">ZADNJE VPRAŠANJE</div>
          <h2 className="cta-h">Koliko ste lani plačali računovodji?</h2>
          <p className="cta-s">Seštejte mesečne račune. Potem pomislite kaj ste za to dobili. Računko stane €228 letno. Ostalo je vaše.</p>
          <Link href="/register" className="btn-cta">Preizkusi brezplačno — brez kreditne kartice →</Link>
          <p className="cta-n">Brez vezave · Prekličete kadarkoli · Podatki v EU</p>
        </div>

        <footer className="foot">
          <div className="flogo">Računko</div>
          <div className="flinks">
          <Link href="/privacy" className="flink">Zasebnost</Link>
          <Link href="/terms" className="flink">Pogoji</Link>
            <a href="#" className="flink">Kontakt</a>
          </div>
          <div className="fcopy">© 2026 · Narejeno za slovenskega podjetnika</div>
        </footer>

      </div>
    </>
  )
}
