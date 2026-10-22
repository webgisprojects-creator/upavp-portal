import AvasVikasLogo from "../assets/images/upavp1_logo1234.png";
import UPLogo from "../assets/images/Uttar_Pradesh.png";

import "../style/Header.css";

export default function Header() {
  return (
    <header className="site-header">
      <img
        className="Avas-logo"
        src={AvasVikasLogo}
        alt="Awas Vikas Parishad logo"
      />

      {/* <h1 className="site-title">Awas Vikas Parishad</h1> */}

      <img
        className="UP-logo"
        src={UPLogo}
        alt="Uttar Pradesh Government logo"
      />
    </header>
  );
}