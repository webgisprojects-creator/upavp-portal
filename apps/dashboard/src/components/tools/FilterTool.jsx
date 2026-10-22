import { FaFilter } from "react-icons/fa";
import ToolButton from "./ToolButton";

export default function FilterTool(props) {
  return (
    <ToolButton label="Filter" {...props}>
      <FaFilter />
    </ToolButton>
  );
}