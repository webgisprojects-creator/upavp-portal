<?xml version='1.0' encoding='UTF-8'?>
<StyledLayerDescriptor xmlns="http://www.opengis.net/sld" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" version="1.0.0" xsi:schemaLocation="http://www.opengis.net/sld http://schemas.opengis.net/sld/1.0.0/StyledLayerDescriptor.xsd">
  <NamedLayer>
    <Name>AwasVikas:gda_road_centre_line</Name>
    <UserStyle>
      <Title>line style</Title>
      <FeatureTypeStyle>
        <Rule>
          <Title> line</Title>
          <MinScaleDenominator>34000</MinScaleDenominator>
          <LineSymbolizer>
            <Stroke>
              <CssParameter name="stroke">#0046ff</CssParameter>
              <CssParameter name="stroke-width">0.8</CssParameter>
            </Stroke>
          </LineSymbolizer>
        </Rule>
        <Rule>
          <Title> line</Title>
          <MinScaleDenominator>8500</MinScaleDenominator>
          <MaxScaleDenominator>34000</MaxScaleDenominator>
          <LineSymbolizer>
            <Stroke>
              <CssParameter name="stroke">#0046ff</CssParameter>
              <CssParameter name="stroke-width">1.3</CssParameter>
            </Stroke>
          </LineSymbolizer>
        </Rule>
        <Rule>
          <Title> line</Title>
          <MaxScaleDenominator>8500</MaxScaleDenominator>
          <LineSymbolizer>
            <Stroke>
              <CssParameter name="stroke">#0046ff</CssParameter>
              <CssParameter name="stroke-width">2.2</CssParameter>
            </Stroke>
          </LineSymbolizer>
        </Rule>
      </FeatureTypeStyle>
    </UserStyle>
  </NamedLayer>
</StyledLayerDescriptor>