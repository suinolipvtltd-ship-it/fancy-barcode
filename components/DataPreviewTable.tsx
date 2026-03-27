import type { LabelRow } from "@/lib/types";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface DataPreviewTableProps {
  rows: LabelRow[];
}

export default function DataPreviewTable({ rows }: DataPreviewTableProps) {
  return (
    <div className="print:hidden no-print">
      <p>{rows.length} row(s) loaded</p>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>#</TableHead>
            <TableHead>Left_Value</TableHead>
            <TableHead>Right_Value</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, index) => (
            <TableRow key={index}>
              <TableCell>{index + 1}</TableCell>
              <TableCell>{row.Left_Value}</TableCell>
              <TableCell>{row.Right_Value}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
