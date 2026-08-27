/** Signal Lab design: the app shell contains only the full-screen game console so input remains the product. */
import { TooltipProvider } from "@/components/ui/tooltip";
import ErrorBoundary from "@/components/ErrorBoundary";
import GameCanvas from "@/components/GameCanvas";
import { ThemeProvider } from "@/contexts/ThemeContext";
import ResultPage from "@/pages/ResultPage";
import GlossaryPage from "@/pages/GlossaryPage";
import { Route, Switch } from "wouter";

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <TooltipProvider>
          <Switch>
            <Route path="/" component={GameCanvas} />
            <Route path="/glossary" component={GlossaryPage} />
            <Route path="/result" component={ResultPage} />
            <Route component={GameCanvas} />
          </Switch>
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
