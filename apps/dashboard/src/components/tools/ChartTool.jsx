import { FaChartBar } from "react-icons/fa";
import ToolButton from "./ToolButton";

export default function ChartTool(props) {
  return (
    <ToolButton label="Chart" {...props}>
      <FaChartBar />
    </ToolButton>
  );
}