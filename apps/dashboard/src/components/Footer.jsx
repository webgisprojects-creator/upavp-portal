import { memo } from "react";

// ==================== CONSTANTS ====================
const FOOTER_STYLES = {
background: "linear-gradient(105deg, #0d659f, #1479bd)",
  //color: "white",
   color:" #e4e9ec",
  textAlign: "center",
  position: "fixed",
  left: 0,
  width: "100%",
  bottom: "0",
  zIndex: 1000,
  fontSize: "11px",
};

const FOOTER_TEXT = "© 2026| Awas Vikas Parishad | Remote Sensing Applications Centre-Uttar Pradesh.";
//const Footer_text1 = All rights reserved. 
const Footer = memo(() => {
  return (
    <div style={FOOTER_STYLES}>
      <p>{FOOTER_TEXT}</p>
    </div>
  );
});

Footer.displayName = "Footer";
export default Footer;