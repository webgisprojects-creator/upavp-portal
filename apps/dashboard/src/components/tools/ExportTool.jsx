import { FaDownload } from "react-icons/fa";
import ToolButton from "./ToolButton";

export default function ExportTool(props) {
  return (
    <ToolButton label="Export" {...props}>
      <FaDownload />
    </ToolButton>
  );
}